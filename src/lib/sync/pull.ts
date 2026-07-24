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
  'consents',
  'answers',
] as const;

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
    const { data, error } = await supabase.from(table).select('*');
    if (error || !data) continue;
    for (const row of data as Record<string, unknown>[]) {
      if (skip.has(row.id as string)) continue;
      await mergeRow(db, table, row);
      merged++;
    }
  }
  return merged;
}
