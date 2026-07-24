// Shared domain types. Mirror the Postgres schema and the local SQLite mirror.

export type UserRole = 'admin' | 'facilitator';
export type EventStatus = 'draft' | 'active' | 'finalised';
export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';
export type TranscriptStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'approved'
  | 'rejected'
  | 'error';
export type InsightStatus = 'draft' | 'edited' | 'final';
export type PurgeSource = 'auto' | 'manual';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
}

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  owner_id: string;
  status: EventStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface QuestionRow {
  id: string;
  event_id: string;
  position: number;
  text: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface IntervieweeRow {
  id: string;
  event_id: string;
  name: string;
  role_or_segment: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface ConsentRow {
  id: string;
  interviewee_id: string;
  signature_path: string | null;
  consent_text_version: string;
  signed_by_name: string;
  signed_at: string;
}

export interface AnswerRow {
  id: string;
  interviewee_id: string;
  event_question_id: string;
  audio_path: string | null;
  local_audio_uri: string | null; // client-only column
  duration_ms: number | null;
  upload_status: UploadStatus;
  recorded_at: string | null;
  audio_purged_at: string | null;
  purge_source: PurgeSource | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  score: number;
  no_speech_prob: number;
  flagged: boolean;
}

export interface TranscriptRow {
  id: string;
  answer_id: string;
  text: string | null;
  edited_text: string | null;
  status: TranscriptStatus;
  quality_score: number | null;
  flagged_segment_count: number;
  segments: Segment[] | null;
  rejection_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
}

export interface InsightRow {
  id: string;
  event_id: string;
  position: number;
  title: string;
  body: string;
  status: InsightStatus;
  generated_by_model: string | null;
}

export interface RecommendationRow {
  id: string;
  insight_id: string;
  body: string;
  status: InsightStatus;
}

export interface EvidenceRow {
  id: string;
  insight_id: string;
  transcript_id: string;
  quote: string;
  char_start: number | null;
  char_end: number | null;
}
