import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SCHEMA_SQL, MIGRATIONS, SERVER_COLUMNS } from './schema';

const DB_NAME = 'interview_insights.db';

// AsyncStorage keys that belong to a signed-in account. Prefixed keys carry
// the user id; the wipe below clears every one that is not the keeper's.
const ACCOUNT_KEY_PREFIXES = ['profile-cache:', 'entitlement-cache:', 'onboarded:'];
export const LAST_USER_KEY = 'last-user-id';

let _db: SQLite.SQLiteDatabase | null = null;
// Set while resetLocalDb runs; getDb() waits on it so nothing re-opens the
// file mid-wipe (expo-sqlite refuses to delete an open database).
let resetting: Promise<void> | null = null;

// The sync engine registers how to wait for an in-flight run, so a wipe never
// races a push/pull. Injected to avoid a db ↔ sync import cycle.
let waitForSync: () => Promise<void> = () => Promise.resolve();
export function registerSyncWaiter(fn: () => Promise<void>): void {
  waitForSync = fn;
}

// PRAGMA user_version tracks how many MIGRATIONS have run. Fresh installs
// execute baseline + all migrations, existing installs just the tail — one
// code path for both.
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.execAsync(MIGRATIONS[version]);
    version++;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (resetting) await resetting;
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync(SCHEMA_SQL);
  await migrate(_db);
  return _db;
}

// Wipe everything this device holds for the signed-in account: the SQLite
// mirror (incl. the outbox and the per-table pull high-water marks, which are
// keyed by table name only), the local recording takes, and the per-account
// AsyncStorage caches. Called on sign-out and when a different user signs in
// on the same device — without it the next user would inherit the previous
// user's rows, push their queued outbox under the wrong JWT, and never pull
// their own older rows because the high-water mark is already past them.
//
// `keepUserId` preserves that account's caches (used on user switch, where
// the new user's profile cache has already been written).
export async function resetLocalDb(keepUserId?: string): Promise<void> {
  if (resetting) return resetting;
  // Let a running sync finish BEFORE raising the gate: the sync calls getDb(),
  // which waits on the gate — raising it first would deadlock both.
  await waitForSync().catch(() => {});
  if (resetting) return resetting;
  resetting = (async () => {
    try {
      await _db?.closeAsync();
    } catch {
      // already closed
    }
    _db = null;
    try {
      await SQLite.deleteDatabaseAsync(DB_NAME);
    } catch (e) {
      // Visible on purpose: a wipe that silently fails is the cross-account
      // leak this function exists to prevent.
      console.warn('[db] local database wipe failed', e);
    }
    // The native delete removes the main file only; drop WAL side-files too.
    const dir = `${FileSystem.documentDirectory}SQLite/`;
    for (const suffix of ['-wal', '-shm', '-journal']) {
      await FileSystem.deleteAsync(`${dir}${DB_NAME}${suffix}`, { idempotent: true }).catch(
        () => {},
      );
    }

    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}recordings`, {
      idempotent: true,
    }).catch(() => {});

    const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
    const doomed = keys.filter((k) => {
      if (k === LAST_USER_KEY) return true;
      if (!ACCOUNT_KEY_PREFIXES.some((p) => k.startsWith(p))) return false;
      return !keepUserId || !k.endsWith(`:${keepUserId}`);
    });
    if (doomed.length > 0) await AsyncStorage.multiRemove(doomed).catch(() => {});
  })().finally(() => {
    resetting = null;
  });
  return resetting;
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

// The outbox pushes every queued change as an upsert, and PostgREST upserts
// are INSERT ... ON CONFLICT DO UPDATE — so the payload has to satisfy the
// table's NOT NULL columns or the insert is rejected before the conflict
// clause is reached. Queueing only {id, deleted_at} therefore meant soft
// deletes never left the device: the row vanished locally and stayed put on
// the server. Send the whole row with deleted_at set instead.
export async function localSoftDelete(
  table: keyof typeof SERVER_COLUMNS,
  id: string,
): Promise<void> {
  const db = await getDb();
  const ts = nowIso();
  const existing = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE id=?`,
    [id],
  );

  const serverPayload: Record<string, unknown> = { id };
  if (existing) {
    for (const c of SERVER_COLUMNS[table]) {
      if (c in existing) serverPayload[c] = existing[c];
    }
  }
  serverPayload.deleted_at = ts;
  serverPayload.updated_at = ts;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE ${table} SET deleted_at=?, updated_at=? WHERE id=?`,
      [ts, ts, id],
    );
    await db.runAsync(
      `INSERT INTO sync_outbox (table_name, row_id, op, payload, created_at)
       VALUES (?, ?, 'upsert', ?, ?)`,
      [table, id, JSON.stringify(serverPayload), ts],
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

