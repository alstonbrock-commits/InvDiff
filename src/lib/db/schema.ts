// Local SQLite schema — the offline source of truth for the CAPTURE path only
// (events, questions, interviewees, consent, answers). Online-only data
// (transcripts, insights, approvals, exports) is read straight from Supabase.
//
// Two queue tables drive the hand-rolled sync:
//   sync_outbox  — queued row mutations, pushed to Postgres in order on reconnect
//   upload_queue — audio blobs, uploaded to Storage separately from row sync

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

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  interviewee_id TEXT NOT NULL,
  signature_path TEXT,
  signature_local_uri TEXT,
  consent_text_version TEXT NOT NULL,
  signed_by_name TEXT NOT NULL,
  signed_at TEXT NOT NULL
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

-- Audio and signature uploads are driven directly off the answers/consents
-- tables (local_audio_uri / signature_local_uri + upload_status), so no
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

// Which local columns are real server columns (payload for the outbox excludes
// client-only fields like local_audio_uri / signature_local_uri).
export const SERVER_COLUMNS: Record<string, string[]> = {
  events: ['id', 'title', 'description', 'owner_id', 'status', 'created_at', 'updated_at', 'deleted_at'],
  event_questions: ['id', 'event_id', 'position', 'text', 'updated_at', 'deleted_at'],
  interviewees: ['id', 'event_id', 'name', 'role_or_segment', 'updated_at', 'deleted_at'],
  consents: ['id', 'interviewee_id', 'signature_path', 'consent_text_version', 'signed_by_name', 'signed_at'],
  answers: ['id', 'interviewee_id', 'event_question_id', 'audio_path', 'duration_ms', 'upload_status', 'recorded_at', 'updated_at', 'deleted_at'],
};
