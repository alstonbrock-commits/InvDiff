// Idempotency bookkeeping for the billing webhook. A row is claimed when an
// event arrives and stamped when processing finishes; a claim older than five
// minutes with no stamp is re-claimed (worker killed mid-run). A failed run
// releases its claim so the provider's retry is processed rather than being
// answered as a duplicate.

// deno-lint-ignore no-explicit-any
type Db = any;

export type BillingProvider = 'revenuecat';

export async function claimBillingEvent(
  db: Db,
  provider: BillingProvider,
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
  provider: BillingProvider,
  eventId: string,
): Promise<void> {
  await db
    .from('billing_events')
    .update({ processed_at: new Date().toISOString() })
    .match({ provider, event_id: eventId });
}

export async function releaseBillingEvent(
  db: Db,
  provider: BillingProvider,
  eventId: string,
): Promise<void> {
  await db.from('billing_events').delete().match({ provider, event_id: eventId });
}
