// revenuecat-webhook: RevenueCat posts every subscription change for the
// Individual plan here. Deployed with --no-verify-jwt; authenticated by the
// static Authorization header configured in the RevenueCat dashboard
// (RC_WEBHOOK_SECRET).
//
// The event body is treated as a TRIGGER, not as truth: on every event we
// re-fetch the subscriber from RevenueCat's REST API and rewrite the
// `subscriptions` row from that. Out-of-order or duplicate deliveries then
// cannot leave the row wrong. Duplicates are short-circuited by
// billing_events; a failed run releases its claim so RevenueCat's retry is
// processed.
//
// Field-name gotcha: webhook events use UPPERCASE store / period_type values
// (APP_STORE, TRIAL); the REST subscriber object uses lowercase (app_store,
// trial). Everything is lower-cased before comparison.
import { json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { sendEmail, welcomeIapEmail } from '../_shared/email.ts';
import {
  claimBillingEvent,
  markBillingEventProcessed,
  releaseBillingEvent,
} from '../_shared/billingEvents.ts';

const ENTITLEMENT_ID = 'individual';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// RevenueCat already extends expires_date through the store's own billing
// grace period; this is just slack for webhook delay.
const GRACE_MS = 24 * 3600_000;

type Provider = 'apple' | 'google' | 'manual';

interface RcSubscription {
  expires_date: string | null;
  purchase_date: string;
  period_type: string;
  store: string;
  unsubscribe_detected_at: string | null;
  billing_issues_detected_at: string | null;
  grace_period_expires_date: string | null;
  is_sandbox: boolean;
}

interface RcSubscriber {
  entitlements: Record<
    string,
    { expires_date: string | null; product_identifier: string; purchase_date: string }
  >;
  subscriptions: Record<string, RcSubscription>;
}

function providerFor(store: string | undefined | null): Provider {
  switch ((store ?? '').toLowerCase()) {
    case 'app_store':
    case 'mac_app_store':
      return 'apple';
    case 'play_store':
    case 'amazon':
      return 'google';
    default:
      return 'manual'; // promotional / unknown
  }
}

// deno-lint-ignore no-explicit-any
type Db = any;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const secret = Deno.env.get('RC_WEBHOOK_SECRET');
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || (auth !== secret && auth !== `Bearer ${secret}`)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: { event?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const event = body?.event as
    | {
        id: string;
        type: string;
        app_user_id?: string;
        store?: string;
        period_type?: string;
        transferred_from?: string[];
        transferred_to?: string[];
      }
    | undefined;
  if (!event?.id || !event?.type) return json({ error: 'bad payload' }, 400);
  const eventId = String(event.id);

  const db = serviceClient();
  try {
    if ((await claimBillingEvent(db, 'revenuecat', eventId, body)) === 'duplicate') {
      return json({ ok: true, duplicate: true });
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  try {
    if (event.type === 'TEST') {
      await markBillingEventProcessed(db, 'revenuecat', eventId);
      return json({ ok: true, ignored: 'test event' });
    }

    // TRANSFER events carry no app_user_id — only transferred_from/to.
    const ids = new Set<string>();
    if (UUID_RE.test(event.app_user_id ?? '')) ids.add(event.app_user_id!);
    for (const id of [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]) {
      if (UUID_RE.test(id)) ids.add(id);
    }
    if (ids.size === 0) {
      await markBillingEventProcessed(db, 'revenuecat', eventId);
      return json({ ok: true, ignored: 'anonymous app user' });
    }

    const fallbackProvider = providerFor(event.store);
    for (const uid of ids) {
      await syncSubscriber(db, uid, fallbackProvider);
    }

    if (event.type === 'INITIAL_PURCHASE' && UUID_RE.test(event.app_user_id ?? '')) {
      await sendWelcome(
        db,
        event.app_user_id!,
        (event.period_type ?? '').toLowerCase() === 'trial',
        fallbackProvider,
      );
    }

    await markBillingEventProcessed(db, 'revenuecat', eventId);
    return json({ ok: true });
  } catch (e) {
    console.error('revenuecat-webhook failed', event.type, String(e));
    await releaseBillingEvent(db, 'revenuecat', eventId);
    return json({ error: String(e) }, 500);
  }
});

async function fetchSubscriber(appUserId: string): Promise<RcSubscriber | null> {
  const key = Deno.env.get('RC_SECRET_API_KEY');
  if (!key) throw new Error('RC_SECRET_API_KEY not configured');
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } },
  );
  if (!res.ok) throw new Error(`revenuecat ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data?.subscriber as RcSubscriber) ?? null;
}

// Google keys subscriptions as "product:base-plan"; match on the prefix too.
function storeEntry(sub: RcSubscriber, productId: string): RcSubscription | undefined {
  const entries = Object.entries(sub.subscriptions ?? {});
  const hit = entries.find(([k]) => k === productId || k.startsWith(`${productId}:`));
  return hit?.[1];
}

async function syncSubscriber(db: Db, userId: string, fallback: Provider): Promise<void> {
  // No profile → nothing to attach the plan to (deleted account, stray id).
  const { data: prof } = await db.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (!prof) return;

  const sub = await fetchSubscriber(userId);
  const ent = sub?.entitlements?.[ENTITLEMENT_ID];

  if (!sub || !ent) {
    // Never had the entitlement (or RevenueCat lost it): expire any store row.
    const { error } = await db
      .from('subscriptions')
      .update({ status: 'expired', access_until: new Date().toISOString() })
      .eq('user_id', userId)
      .in('provider', ['apple', 'google']);
    if (error) throw new Error(`subscriptions expire: ${error.message}`);
    return;
  }

  const store = storeEntry(sub, ent.product_identifier);
  let provider = providerFor(store?.store);
  if (provider === 'manual') {
    // Unknown/promotional store — still record the entitlement rather than
    // silently leaving a paying user without a row.
    console.error('revenuecat: unknown store for', userId, ent.product_identifier, store?.store);
    provider = fallback === 'apple' || fallback === 'google' ? fallback : 'manual';
  }

  const expires = ent.expires_date ? Date.parse(ent.expires_date) : null;
  const grace = store?.grace_period_expires_date
    ? Date.parse(store.grace_period_expires_date)
    : null;
  const accessUntilMs =
    expires === null
      ? Date.now() + 100 * 365 * 86_400_000
      : Math.max(expires, grace ?? 0) + GRACE_MS;
  const current = expires === null || expires > Date.now();
  const periodType = (store?.period_type ?? '').toLowerCase();

  let status: string;
  if (!current) status = 'expired';
  else if (store?.billing_issues_detected_at) status = 'billing_issue';
  else if (store?.unsubscribe_detected_at) status = 'canceled'; // still current until expires
  else if (periodType === 'trial') status = 'trialing';
  else status = 'active';

  const { error } = await db.from('subscriptions').upsert(
    {
      user_id: userId,
      provider,
      provider_ref: ent.product_identifier,
      status,
      trial_end: periodType === 'trial' ? ent.expires_date : null,
      current_period_end: ent.expires_date,
      access_until: new Date(accessUntilMs).toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`subscriptions upsert: ${error.message}`);
}

async function sendWelcome(
  db: Db,
  userId: string,
  trial: boolean,
  store: Provider,
): Promise<void> {
  try {
    const { data: prof } = await db
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .maybeSingle();
    if (!prof?.email) return;
    const msg = welcomeIapEmail({ name: prof.full_name || null, store, trial });
    await sendEmail({ to: prof.email, ...msg });
  } catch (e) {
    // Email is a courtesy; the subscription row is what matters.
    console.error('welcome email failed', String(e));
  }
}
