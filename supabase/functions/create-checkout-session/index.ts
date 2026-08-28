// create-checkout-session: starts a Stripe Checkout for the web portal.
//   kind 'enterprise' → per-seat subscription for a new organisation the
//     caller will supervise (seats ≥ 3, supervisor included).
//   kind 'individual' → one Individual seat with a 7-day trial (web path;
//     the mobile apps use in-app purchase instead).
// Returns the hosted Checkout URL. The organisation row is created here in
// status 'pending'; the stripe-webhook flips it to active and attaches the
// caller as supervisor once payment succeeds.
import { handleOptions, json } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { findOrCreateCustomer, getStripe, PORTAL_URL } from '../_shared/stripe.ts';

const MIN_SEATS = 3;
const MAX_SEATS = 500;
const TRIAL_DAYS = 7;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { user } = await requireUser(req);
    const body = await req.json();
    const kind = body?.kind;
    if (kind !== 'enterprise' && kind !== 'individual') {
      return json({ error: 'kind must be enterprise or individual' }, 400);
    }
    const priceSeat = Deno.env.get('STRIPE_PRICE_SEAT');
    const priceIndividual = Deno.env.get('STRIPE_PRICE_INDIVIDUAL');

    const db = serviceClient();
    const stripe = getStripe();
    const { data: prof } = await db
      .from('profiles')
      .select('id, email, full_name, org_id, org_role')
      .eq('id', user.id)
      .single();
    if (!prof) return json({ error: 'profile not found' }, 404);

    const common = {
      mode: 'subscription' as const,
      automatic_tax: { enabled: true },
      // Business customers enter their ABN; it prints on every invoice.
      tax_id_collection: { enabled: true },
      billing_address_collection: 'required' as const,
      customer_update: { name: 'auto' as const, address: 'auto' as const },
      allow_promotion_codes: true,
      cancel_url: `${PORTAL_URL}/checkout/cancelled`,
    };

    if (kind === 'enterprise') {
      if (!priceSeat) return json({ error: 'STRIPE_PRICE_SEAT not configured' }, 500);
      const seats = Number(body.seats);
      const orgName = String(body.org_name ?? '').trim();
      if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) {
        return json({ error: `seats must be between ${MIN_SEATS} and ${MAX_SEATS}` }, 400);
      }
      if (!orgName) return json({ error: 'org_name required' }, 400);

      // Already attached to an organisation: only its owner may (re)subscribe
      // it, and only while it is pending (never paid) or canceled (lapsed).
      // Re-subscribing a lapsed organisation reuses the SAME row, so members
      // who kept their org_id come back with it.
      let org: Record<string, unknown> | null = null;
      if (prof.org_id) {
        const { data: current } = await db
          .from('organisations')
          .select('*')
          .eq('id', prof.org_id)
          .single();
        if (!current || current.owner_id !== user.id || !['pending', 'canceled'].includes(current.status)) {
          return json({ error: 'already_in_organisation' }, 409);
        }
        org = current;
      }

      // Otherwise reuse an abandoned pending org this user owns rather than
      // piling up rows.
      if (!org) {
        const { data: pendingOrg } = await db
          .from('organisations')
          .select('*')
          .eq('owner_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        org = pendingOrg;
      }
      if (org) {
        const { error } = await db
          .from('organisations')
          .update({ name: orgName, seat_count: seats })
          .eq('id', org.id);
        if (error) return json({ error: error.message }, 500);
      } else {
        const ins = await db
          .from('organisations')
          .insert({ name: orgName, owner_id: user.id, seat_count: seats, status: 'pending' })
          .select('*')
          .single();
        if (ins.error || !ins.data) return json({ error: ins.error?.message ?? 'insert failed' }, 500);
        org = ins.data;
      }

      const customer =
        org.stripe_customer_id ??
        (await findOrCreateCustomer({
          userId: user.id,
          email: prof.email,
          name: orgName,
          orgId: org.id,
        }));
      if (!org.stripe_customer_id) {
        await db.from('organisations').update({ stripe_customer_id: customer }).eq('id', org.id);
      }

      const session = await stripe.checkout.sessions.create({
        ...common,
        customer,
        line_items: [{ price: priceSeat, quantity: seats }],
        client_reference_id: org.id,
        metadata: { kind: 'enterprise', org_id: org.id, user_id: user.id },
        subscription_data: {
          metadata: { kind: 'enterprise', org_id: org.id, user_id: user.id },
        },
        success_url: `${PORTAL_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      });
      return json({ url: session.url, org_id: org.id });
    }

    // ---- individual ----------------------------------------------------------
    if (!priceIndividual) return json({ error: 'STRIPE_PRICE_INDIVIDUAL not configured' }, 500);
    if (prof.org_id) return json({ error: 'already_in_organisation' }, 409);

    const { data: existing } = await db
      .from('subscriptions')
      .select('provider, provider_ref, status, access_until')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing?.access_until && Date.parse(existing.access_until) > Date.now()) {
      return json({ error: 'already_subscribed', provider: existing.provider }, 409);
    }

    const customer = await findOrCreateCustomer({
      userId: user.id,
      email: prof.email,
      name: prof.full_name,
      // A lapsed Stripe subscriber already has a customer — reuse it rather
      // than relying on Stripe's lagging search index.
      knownSubscriptionId: existing?.provider === 'stripe' ? existing.provider_ref : null,
    });
    const session = await stripe.checkout.sessions.create({
      ...common,
      customer,
      line_items: [{ price: priceIndividual, quantity: 1 }],
      metadata: { kind: 'individual', user_id: user.id },
      subscription_data: {
        metadata: { kind: 'individual', user_id: user.id },
        // One trial per account: a lapsed subscriber pays from day one.
        ...(existing ? {} : { trial_period_days: TRIAL_DAYS }),
      },
      success_url: `${PORTAL_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    });
    return json({ url: session.url });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: String(e) }, 500);
  }
});
