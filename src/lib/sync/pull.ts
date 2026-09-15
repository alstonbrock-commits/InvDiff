// Pull server rows into the local mirror. Direct SQLite writes (NOT through the
// outbox). Rows that still have a pending outbox entry are skipped so an
// un-pushed local edit is never clobbered by older server data.
import { all, getDb } from '../db';
import { supabase } from '../supabase';
import { SERVER_COLUMNS } from '../db/schema';

const PULL_TABLES = [
  'events',
  'event_questions',
  'interviewees',
  'answers',
  'event_photos',
] as const;

// Every pull table carries a server-side updated_at (set by trigger), so pulls
// can be incremental. sync_state stores the high-water mark per table.
async function lastPulledAt(table: string): Promise<string | null> {
  const row = await all<{ last_pulled_at: string | null }>(
    `SELECT last_pulled_at FROM sync_state WHERE table_name=?`,
    [table],
  );
  return row[0]?.last_pulled_at ?? null;
}

async function setLastPulledAt(table: string, iso: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_state (table_name, last_pulled_at) VALUES (?, ?)
     ON CONFLICT(table_name) DO UPDATE SET last_pulled_at=excluded.last_pulled_at`,
    [table, iso],
  );
}

async function pendingIds(table: string): Promise<Set<string>> {
  const rows = await all<{ row_id: string }>(
    `SELECT DISTINCT row_id FROM sync_outbox WHERE table_name=? AND status='pending'`,
    [table],
  );
  return new Set(rows.map((r) => r.row_id));
}

async function mergeRow(
  db: Awaited<ReturnType<typeof getDb>>,
  table: string,
  row: Record<string, unknown>,
) {
  const cols = SERVER_COLUMNS[table].filter((c) => c in row);
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols
    .filter((c) => c !== 'id')
    .map((c) => `${c}=excluded.${c}`)
    .join(', ');
  const values = cols.map((c) => {
    const v = row[c];
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v as never;
  });
  await db.runAsync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updates}`,
    values,
  );
}

export async function pullAll(): Promise<number> {
  const db = await getDb();
  let merged = 0;

  for (const table of PULL_TABLES) {
    const skip = await pendingIds(table);
    const since = await lastPulledAt(table);
    let query = supabase.from(table).select('*');
    if (since) query = query.gt('updated_at', since);
    const { data, error } = await query;
    if (error || !data) continue;

    let maxUpdatedAt = since;
    for (const row of data as Record<string, unknown>[]) {
      const rowUpdated = row.updated_at as string | undefined;
      if (rowUpdated && (!maxUpdatedAt || rowUpdated > maxUpdatedAt)) {
        maxUpdatedAt = rowUpdated;
      }
      if (skip.has(row.id as string)) continue;
      await mergeRow(db, table, row);
      merged++;
    }
    // Advance the high-water mark even for skipped rows — their local copy is
    // newer (pending push) and will round-trip through the outbox anyway.
    if (maxUpdatedAt && maxUpdatedAt !== since) {
      await setLastPulledAt(table, maxUpdatedAt);
    }
  }
  return merged;
}
