// Push queued local mutations to Postgres, in insertion order. Every op is an
// idempotent upsert (deletes are soft — payload carries deleted_at), keyed by
// the client-generated UUID, so retries are safe.
import { all, getDb } from '../db';
import { SERVER_COLUMNS } from '../db/schema';
import { supabase } from '../supabase';

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e)
    return String((e as { message: unknown }).message);
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

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
      // Poison tombstone from before localSoftDelete sent full rows: a payload
      // of only {id, deleted_at, updated_at} can never satisfy the table's NOT
      // NULL columns (PostgREST upserts are INSERT .. ON CONFLICT, and the
      // proposed tuple is checked before the conflict clause). Heal it in
      // place — rebuild the payload from the full local row; if the local row
      // is gone there is nothing the server could need, so mark it done.
      // A partial tombstone surfaces as 23502 (NOT NULL) or, when an owner
      // check reads the missing column first, as 42501 (RLS violation).
      const code = (e as { code?: string })?.code;
      const tombstone = item.payload.includes('"deleted_at"');
      if (
        (code === '23502' || code === '42501') &&
        tombstone &&
        item.table_name in SERVER_COLUMNS
      ) {
        const localRow = await db.getFirstAsync<Record<string, unknown>>(
          `SELECT * FROM ${item.table_name} WHERE id=?`,
          [item.row_id],
        );
        if (localRow) {
          const old = JSON.parse(item.payload) as Record<string, unknown>;
          const full: Record<string, unknown> = {};
          for (const c of SERVER_COLUMNS[
            item.table_name as keyof typeof SERVER_COLUMNS
          ]) {
            if (c in localRow) full[c] = localRow[c];
          }
          full.deleted_at =
            old.deleted_at ?? localRow.deleted_at ?? new Date().toISOString();
          full.updated_at = old.updated_at ?? localRow.updated_at;
          await db.runAsync(
            `UPDATE sync_outbox SET payload=?, attempts=0, last_error='healed partial tombstone' WHERE id=?`,
            [JSON.stringify(full), item.id],
          );
        } else {
          await db.runAsync(
            `UPDATE sync_outbox SET status='done', last_error='dropped: tombstone for a row that never reached the server' WHERE id=?`,
            [item.id],
          );
        }
        continue; // healed or dropped — never let it block the queue
      }

      const attempts = item.attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await db.runAsync(
        `UPDATE sync_outbox SET attempts=?, last_error=?, status=? WHERE id=?`,
        [attempts, errorText(e), status, item.id],
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
