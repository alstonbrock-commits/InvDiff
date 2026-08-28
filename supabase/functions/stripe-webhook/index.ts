// stripe-webhook: keeps organisations / subscriptions in step with Stripe.
// Deployed with --no-verify-jwt; authenticated by the Stripe signature.
//
// Events are treated as TRIGGERS: whichever event arrives, the subscription
// is re-read from Stripe and the row rewritten from that, so ordering and
// duplicates cannot leave the row wrong. billing_events short-circuits
// replays; a failed run releases its claim so Stripe's retry is processed.
import { json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/supabase.ts';
import {
  accessUntil,
  claimBillingEvent,
  cryptoProvider,
  customerIdOf,
  getStripe,
  invoiceSubscriptionId,
  mapStatus,
  markBillingEventProcessed,
  periodEnd,
  releaseBillingEvent,
  seatQuantity,
  Stripe,
  subscriptionIdOf,
} from '../_shared/stripe.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const sig = req.headers.get('stripe-signature');
  if (!secret || !sig) return json({ error: 'missing signature' }, 400);

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(raw, sig, secret, undefined, cryptoProvider);
  } catch (e) {
    return json({ error: `invalid signature: ${String(e)}` }, 400);
  }

  const db = serviceClient();
  try {
    if ((await claimBillingEvent(db, 'stripe', event.id, { type: event.type })) === 'duplicate') {
      return json({ ok: true, duplicate: true });
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  try {
    const stripe = getStripe();
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId = subscriptionIdOf(session.subscription);
        if (subId) {
          await applySubscription(db, await stripe.subscriptions.retrieve(subId), {
            kind: session.metadata?.kind ?? null,
            org_id: session.metadata?.org_id ?? session.client_reference_id ?? null,
            user_id: session.metadata?.user_id ?? null,
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscription(db, await stripe.subscriptions.retrieve(sub.id));
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.payment_action_required': {
        const subId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
        if (subId) await applySubscription(db, await stripe.subscriptions.retrieve(subId));
        break;
      }
      default:
        // Recorded in billing_events; nothing to apply.
        break;
    }
    await markBillingEventProcessed(db, 'stripe', event.id);
    return json({ ok: true });
  } catch (e) {
    console.error('stripe-webhook failed', event.type, String(e));
    // 500 makes Stripe retry; release the claim so the retry is processed.
    await releaseBillingEvent(db, 'stripe', event.id);
    return json({ error: String(e) }, 500);
  }
});

interface Hints {
  kind: string | null;
  org_id: string | null;
  user_id: string | null;
}

async function applySubscription(
  db: Db,
  sub: Stripe.Subscription,
  hints: Hints = { kind: null, org_id: null, user_id: null },
): Promise<void> {
  const meta = sub.metadata ?? {};
  const kind = meta.kind ?? hints.kind;
  const status = mapStatus(sub.status);
  const end = periodEnd(sub);
  const until = accessUntil(status, end);
  const customer = customerIdOf(sub.customer);

  if (kind === 'enterprise') {
    const orgId = meta.org_id ?? hints.org_id;
    if (!orgId) return;
    const { data: org } = await db.from('organisations').select('*').eq('id', orgId).single();
    if (!org) return;
    // A closed organisation (owner deleted their account) stays closed.
    if (org.status === 'closed') return;
    // A stale event for an older subscription must not overwrite a newer one
    // (an organisation that cancelled and re-subscribed).
    if (
      org.stripe_subscription_id &&
      org.stripe_subscription_id !== sub.id &&
      sub.created * 1000 < Date.parse(org.updated_at) - 60_000 &&
      status === 'canceled'
    ) {
      return;
    }

    const { error } = await db
      .from('organisations')
      .update({
        stripe_subscription_id: sub.id,
        stripe_customer_id: customer ?? org.stripe_customer_id,
        seat_count: seatQuantity(sub) || org.seat_count,
        status,
        current_period_end: end?.toISOString() ?? null,
        access_until: until.toISOString(),
      })
      .eq('id', orgId);
    if (error) throw new Error(`organisations update: ${error.message}`);

    // First successful activation attaches the owner as supervisor. Never
    // done from signup metadata — only here, once Stripe has confirmed.
    if (status === 'trialing' || status === 'active' || status === 'past_due') {
      const { error: attachErr } = await db
        .from('profiles')
        .update({ org_id: orgId, org_role: 'supervisor' })
        .eq('id', org.owner_id)
        .is('org_id', null);
      if (attachErr) throw new Error(`owner attach: ${attachErr.message}`);
    }
    return;
  }

  if (kind === 'individual') {
    const userId = meta.user_id ?? hints.user_id;
    if (!userId) return;
    const { data: prof } = await db.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!prof) return;

    // Same vocabulary as the RevenueCat rows: 'canceled' = still current but
    // auto-renew is off; dead subscriptions are 'expired'.
    let rowStatus: string;
    if (status === 'canceled') rowStatus = 'expired';
    else if (status === 'pending') rowStatus = 'incomplete';
    else if (status === 'active' && sub.cancel_at_period_end) rowStatus = 'canceled';
    else rowStatus = status;

    const { error } = await db.from('subscriptions').upsert(
      {
        user_id: userId,
        provider: 'stripe',
        provider_ref: sub.id,
        status: rowStatus,
        trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        current_period_end: end?.toISOString() ?? null,
        access_until: until.toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw new Error(`subscriptions upsert: ${error.message}`);
  }
}
