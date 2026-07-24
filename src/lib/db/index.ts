import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { SCHEMA_SQL, SERVER_COLUMNS } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('interview_insights.db');
  await _db.execAsync(SCHEMA_SQL);
  return _db;
}

export function uuid(): string {
  return Crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

// -- Generic local write + outbox enqueue (single transaction) ---------------
// `row` must include an `id`. Only server columns are enqueued to the outbox.
export async function localUpsert(
  table: keyof typeof SERVER_COLUMNS,
  row: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols.map((c) => `${c}=excluded.${c}`).join(', ');
  const values = cols.map((c) => normalize(row[c]));

  const serverPayload: Record<string, unknown> = {};
  for (const c of SERVER_COLUMNS[table]) {
    if (c in row) serverPayload[c] = row[c];
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updates}`,
      values,
    );
    await db.runAsync(
      `INSERT INTO sync_outbox (table_name, row_id, op, payload, created_at)
       VALUES (?, ?, 'upsert', ?, ?)`,
      [table, row.id as string, JSON.stringify(serverPayload), nowIso()],
    );
  });
}

export async function localSoftDelete(
  table: keyof typeof SERVER_COLUMNS,
  id: string,
): Promise<void> {
  const db = await getDb();
  const ts = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE ${table} SET deleted_at=?, updated_at=? WHERE id=?`,
      [ts, ts, id],
    );
    await db.runAsync(
      `INSERT INTO sync_outbox (table_name, row_id, op, payload, created_at)
       VALUES (?, ?, 'upsert', ?, ?)`,
      [table, id, JSON.stringify({ id, deleted_at: ts, updated_at: ts }), ts],
    );
  });
}

function normalize(v: unknown): SQLite.SQLiteBindValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  return v as SQLite.SQLiteBindValue;
}

// -- Read helpers ------------------------------------------------------------
export async function all<T = Record<string, unknown>>(
  sql: string,
  params: SQLite.SQLiteBindValue[] = [],
): Promise<T[]> {
  const db = await getDb();
  return db.getAllAsync<T>(sql, params);
}

export async function first<T = Record<string, unknown>>(
  sql: string,
  params: SQLite.SQLiteBindValue[] = [],
): Promise<T | null> {
  const db = await getDb();
  return db.getFirstAsync<T>(sql, params);
}

export async function run(
  sql: string,
  params: SQLite.SQLiteBindValue[] = [],
): Promise<void> {
  const db = await getDb();
  await db.runAsync(sql, params);
}
