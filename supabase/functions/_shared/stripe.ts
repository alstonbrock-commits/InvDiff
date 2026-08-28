// Stripe client + the handful of translations between Stripe's subscription
// model and ours. Used by create-checkout-session, stripe-webhook,
// create-billing-portal-session, update-seats and delete-account.
//
// stripe-node v18+ defaults to the 2025-03-31 ("basil") API, where a
// subscription's current_period_end lives on each subscription ITEM rather
// than on the subscription itself. periodEnd() reads both so a pinned older
// API version keeps working too.
import Stripe from 'npm:stripe@^18.0.0';

export { Stripe };
export { PORTAL_URL } from './portal.ts';

// Built lazily: stripe-node throws on an empty key at construction, and a
// module-level client would take down every importer when the secret is
// missing — including functions that only need a helper from this file.
let client: Stripe | undefined;
export function getStripe(): Stripe {
  if (!client) {
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    client = new Stripe(key, {
      // Deno has no Node http agent; use the fetch-based client.
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return client;
}

export const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Days of access we keep granting after a period ends without payment —
// covers Stripe's own retry window so a failed card does not lock a team out
// mid-investigation. Access is a hard stop after this.
export const GRACE_DAYS = 7;

export type OrgStatus = 'pending' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'closed';

export function mapStatus(s: Stripe.Subscription.Status): OrgStatus {
  switch (s) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'incomplete':
      return 'pending';
    default: // canceled, unpaid, incomplete_expired, paused
      return 'canceled';
  }
}

export function periodEnd(sub: Stripe.Subscription): Date | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const ts = item?.current_period_end ?? legacy;
  return ts ? new Date(ts * 1000) : null;
}

export function seatQuantity(sub: Stripe.Subscription): number {
  return sub.items?.data?.[0]?.quantity ?? 0;
}

export function accessUntil(status: OrgStatus, end: Date | null): Date {
  if ((status === 'trialing' || status === 'active' || status === 'past_due') && end) {
    return new Date(end.getTime() + GRACE_DAYS * 86_400_000);
  }
  return new Date();
}

export function subscriptionIdOf(
  ref: string | Stripe.Subscription | null | undefined,
): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

export function customerIdOf(
  ref: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

// The subscription an invoice belongs to moved under invoice.parent in basil.
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
  }).parent;
  const fromParent = parent?.subscription_details?.subscription;
  if (fromParent) return typeof fromParent === 'string' ? fromParent : fromParent.id;
  const legacy = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  if (legacy) return typeof legacy === 'string' ? legacy : legacy.id;
  return null;
}

// One Stripe customer per Supabase user. Prefer an id we already hold (the
// organisation row, or the customer on a tracked subscription) — Stripe's
// Search index lags by up to a minute, so it is only the fallback.
export async function findOrCreateCustomer(opts: {
  userId: string;
  email: string;
  name?: string | null;
  orgId?: string | null;
  knownSubscriptionId?: string | null;
}): Promise<string> {
  const stripe = getStripe();
  if (opts.knownSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(opts.knownSubscriptionId);
      const id = customerIdOf(sub.customer);
      if (id) return id;
    } catch {
      // fall through to search
    }
  }
  const found = await stripe.customers.search({
    query: `metadata['user_id']:'${opts.userId}'`,
    limit: 1,
  });
  if (found.data[0]) return found.data[0].id;
  const created = await stripe.customers.create({
    email: opts.email,
    name: opts.name ?? undefined,
    metadata: { user_id: opts.userId, ...(opts.orgId ? { org_id: opts.orgId } : {}) },
  });
  return created.id;
}

// deno-lint-ignore no-explicit-any
type Db = any;

// Idempotency bookkeeping shared by both webhooks. Returns 'process' when the
// event should be handled, 'duplicate' when it already was. A row that was
// claimed but never marked processed (worker killed mid-way) is re-claimed
// after five minutes.
export async function claimBillingEvent(
  db: Db,
  provider: 'stripe' | 'revenuecat',
  eventId: string,
  payload: unknown,
): Promise<'process' | 'duplicate'> {
  const { error } = await db
    .from('billing_events')
    .insert({ provider, event_id: eventId, payload });
  if (!error) return 'process';
  if (error.code !== '23505') throw new Error(`billing_events insert: ${error.message}`);

  const { data: existing } = await db
    .from('billing_events')
    .select('processed_at, received_at')
    .match({ provider, event_id: eventId })
    .maybeSingle();
  if (existing && !existing.processed_at) {
    const age = Date.now() - Date.parse(existing.received_at);
    if (age > 5 * 60_000) return 'process';
  }
  return 'duplicate';
}

export async function markBillingEventProcessed(
  db: Db,
  provider: 'stripe' | 'revenuecat',
  eventId: string,
): Promise<void> {
  await db
    .from('billing_events')
    .update({ processed_at: new Date().toISOString() })
    .match({ provider, event_id: eventId });
}

// On failure the claim is released so the provider's retry is processed
// rather than answered as a duplicate.
export async function releaseBillingEvent(
  db: Db,
  provider: 'stripe' | 'revenuecat',
  eventId: string,
): Promise<void> {
  await db.from('billing_events').delete().match({ provider, event_id: eventId });
}

export function must<T>(res: { error: { message: string } | null; data?: T }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}
