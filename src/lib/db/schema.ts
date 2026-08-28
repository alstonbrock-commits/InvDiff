// Local SQLite schema — the offline source of truth for the CAPTURE path only
// (events, questions, interviewees, answers, photos). Online-only data
// (transcripts, insights, approvals, exports) is read straight from Supabase.
//
// sync_outbox queues row mutations, pushed to Postgres in order on reconnect.
// Blob uploads (audio / photos) are driven directly off their
// tables' *_local_uri columns — no separate queue.
//
// SCHEMA_SQL is the frozen v0 baseline; every later shape change lives in
// MIGRATIONS below (applied via PRAGMA user_version in db/index.ts).

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS event_questions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS interviewees (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role_or_segment TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  interviewee_id TEXT NOT NULL,
  event_question_id TEXT NOT NULL,
  audio_path TEXT,
  local_audio_uri TEXT,
  duration_ms INTEGER,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  recorded_at TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  op TEXT NOT NULL,               -- 'upsert' | 'delete'
  payload TEXT NOT NULL,          -- JSON of the row (server columns only)
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'done' | 'failed'
);

-- Audio and photo uploads are driven directly off the answers/event_photos
-- tables (local_audio_uri / local_uri + upload_status), so no
-- separate queue table is needed.

CREATE TABLE IF NOT EXISTS sync_state (
  table_name TEXT PRIMARY KEY,
  last_pulled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_questions_event ON event_questions(event_id);
CREATE INDEX IF NOT EXISTS idx_interviewees_event ON interviewees(event_id);
CREATE INDEX IF NOT EXISTS idx_answers_interviewee ON answers(interviewee_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON sync_outbox(status, id);
`;

// Ordered shape changes on top of the baseline. Index = migration number - 1.
// Never edit an entry after it ships — append a new one.
export const MIGRATIONS: string[] = [
  // 1 — events site/occurred_at + event_photos (server migration 0007)
  `
ALTER TABLE events ADD COLUMN site TEXT;
ALTER TABLE events ADD COLUMN occurred_at TEXT;

CREATE TABLE IF NOT EXISTS event_photos (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  storage_path TEXT,
  local_uri TEXT,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_photos_event ON event_photos(event_id);
`,
  // 2 — consent capture removed (server migration 0013). Drops the local table
  // and any queued signature rows on devices that had it.
  `
DELETE FROM sync_outbox WHERE table_name = 'consents';
DROP TABLE IF EXISTS consents;
`,
  // 3 — enterprise: the organisation's members (server view team_members,
  // migration 0029). Read-only mirror so the supervisor feed can name whose
  // event each card is, offline. RLS scopes the pull: supervisors get the
  // whole team, members get themselves + their supervisor.
  `
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  job_title TEXT,
  org_role TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
`,
];

// Which local columns are real server columns (payload for the outbox excludes
// client-only fields like local_audio_uri / local_uri).
export const SERVER_COLUMNS: Record<string, string[]> = {
  events: ['id', 'title', 'description', 'site', 'occurred_at', 'owner_id', 'status', 'created_at', 'updated_at', 'deleted_at'],
  event_questions: ['id', 'event_id', 'position', 'text', 'updated_at', 'deleted_at'],
  interviewees: ['id', 'event_id', 'name', 'role_or_segment', 'updated_at', 'deleted_at'],
  answers: ['id', 'interviewee_id', 'event_question_id', 'audio_path', 'duration_ms', 'upload_status', 'recorded_at', 'updated_at', 'deleted_at'],
  event_photos: ['id', 'event_id', 'storage_path', 'position', 'created_at', 'updated_at', 'deleted_at'],
  // Pull-only (a view on the server); never written from the device.
  team_members: ['id', 'full_name', 'email', 'job_title', 'org_role', 'is_active', 'updated_at'],
};
