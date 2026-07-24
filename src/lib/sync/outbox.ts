// Push queued local mutations to Postgres, in insertion order. Every op is an
// idempotent upsert (deletes are soft — payload carries deleted_at), keyed by
// the client-generated UUID, so retries are safe.
import { all, getDb } from '../db';
import { supabase } from '../supabase';

const MAX_ATTEMPTS = 8;

interface OutboxItem {
  id: number;
  table_name: string;
  row_id: string;
  op: string;
  payload: string;
  attempts: number;
}

export async function drainOutbox(): Promise<{ pushed: number; failed: number }> {
  const db = await getDb();
  let pushed = 0;
  let failed = 0;

  const items = await all<OutboxItem>(
    `SELECT id, table_name, row_id, op, payload, attempts FROM sync_outbox
     WHERE status='pending' ORDER BY id ASC LIMIT 200`,
  );

  for (const item of items) {
    try {
      const payload = JSON.parse(item.payload);
      const { error } = await supabase
        .from(item.table_name)
        .upsert(payload, { onConflict: 'id' });
      if (error) throw error;

      await db.runAsync(`UPDATE sync_outbox SET status='done' WHERE id=?`, [
        item.id,
      ]);
      pushed++;
    } catch (e) {
      const attempts = item.attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await db.runAsync(
        `UPDATE sync_outbox SET attempts=?, last_error=?, status=? WHERE id=?`,
        [attempts, String(e), status, item.id],
      );
      failed++;
      // Preserve ordering: stop on first hard failure so we don't push later
      // rows that may depend on this one (e.g. a question before its event).
      if (status === 'pending') break;
    }
  }

  // Housekeeping: clear old done rows.
  await db.runAsync(
    `DELETE FROM sync_outbox WHERE status='done' AND created_at < ?`,
    [new Date(Date.now() - 7 * 864e5).toISOString()],
  );

  return { pushed, failed };
}

export async function outboxPendingCount(): Promise<number> {
  const rows = await all<{ c: number }>(
    `SELECT COUNT(*) c FROM sync_outbox WHERE status='pending'`,
  );
  return rows[0]?.c ?? 0;
}

export async function outboxFailed(): Promise<
  { table_name: string; row_id: string; last_error: string }[]
> {
  return all(
    `SELECT table_name, row_id, last_error FROM sync_outbox WHERE status='failed'`,
  );
}

// Requeue failed items (e.g. from a "retry" button after fixing connectivity).
export async function requeueFailed(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_outbox SET status='pending', attempts=0 WHERE status='failed'`,
  );
}
