// Shared domain types. Mirror the Postgres schema and the local SQLite mirror.

export type UserRole = 'admin' | 'facilitator';
/** Enterprise seat role; null for individual accounts. */
export type OrgRole = 'supervisor' | 'member';
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
  job_title: string | null;
  newsletter_opt_in: boolean;
  newsletter_opt_in_at: string | null;
  /** Enterprise organisation this account belongs to (null = individual). */
  org_id: string | null;
  org_role: OrgRole | null;
  /** When the first-run onboarding slideshow was completed. */
  onboarded_at: string | null;
}

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  site: string | null;
  occurred_at: string | null;
  owner_id: string;
  status: EventStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EventPhotoRow {
  id: string;
  event_id: string;
  storage_path: string | null;
  local_uri: string | null; // client-only column
  position: number;
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

export interface TranscriptRow {
  id: string;
  answer_id: string;
  text: string | null;
  edited_text: string | null;
  status: TranscriptStatus;
  rejection_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
}

export interface SupportingExample {
  text: string;
  include_in_report: boolean;
}

export interface InsightRow {
  id: string;
  event_id: string;
  position: number;
  title: string;
  body: string;
  /** System condition the insight is about (report vocabulary). */
  theme: string | null;
  system_significance: string | null;
  supporting_examples: SupportingExample[] | null;
  /** Legacy "contributing factors" — pre-report-structure events only. */
  factors: string[] | null;
  status: InsightStatus;
  generated_by_model: string | null;
  generated_at: string | null;
}

/** Report-level content for an event (one row), from the synthesis pass. */
export interface EventReportRow {
  event_id: string;
  event_description: string | null;
  executive_summary: string | null;
  limitations: string | null;
  next_steps: string[] | null;
  data_quality_note: string | null;
  facilitator_name: string | null;
  interviews_reviewed: number;
  roles_reviewed: string[] | null;
  generated_at: string | null;
}

export interface RecommendationRow {
  id: string;
  insight_id: string;
  /** The recommended action itself. */
  body: string;
  risk_reduction_rationale: string | null;
  verification_method: string | null;
  /** Issue supported but not a specific fix — shown as "Option to consider". */
  is_option: boolean;
  position: number | null;
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
