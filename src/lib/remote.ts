// Direct Supabase access for ONLINE-only data (transcripts, approvals,
// insights, recommendations, exports). RLS enforces who can see/do what.
import { supabase } from './supabase';
import type {
  EvidenceRow,
  InsightRow,
  RecommendationRow,
  Segment,
  TranscriptStatus,
} from './types';

export interface TranscriptDetail {
  id: string;
  answer_id: string;
  text: string | null;
  edited_text: string | null;
  status: TranscriptStatus;
  quality_score: number | null;
  flagged_segment_count: number;
  segments: Segment[] | null;
  rejection_note: string | null;
  interviewee_name: string;
  question_position: number;
  question_text: string;
  event_id: string;
  event_title: string;
}

const TRANSCRIPT_SELECT = `
  id, answer_id, text, edited_text, status, quality_score,
  flagged_segment_count, segments, rejection_note,
  answers!inner (
    event_question_id,
    event_questions:event_question_id ( position, text ),
    interviewees!inner ( name, event_id, events!inner ( id, title ) )
  )
`;

// deno-lint-ignore no-explicit-any
function shapeTranscript(r: any): TranscriptDetail {
  const a = r.answers;
  return {
    id: r.id,
    answer_id: r.answer_id,
    text: r.text,
    edited_text: r.edited_text,
    status: r.status,
    quality_score: r.quality_score,
    flagged_segment_count: r.flagged_segment_count,
    segments: r.segments,
    rejection_note: r.rejection_note,
    interviewee_name: a.interviewees.name,
    question_position: a.event_questions?.position ?? 0,
    question_text: a.event_questions?.text ?? '',
    event_id: a.interviewees.events.id,
    event_title: a.interviewees.events.title,
  };
}

export async function fetchEventTranscripts(
  eventId: string,
): Promise<TranscriptDetail[]> {
  const { data, error } = await supabase
    .from('transcripts')
    .select(TRANSCRIPT_SELECT)
    .eq('answers.interviewees.event_id', eventId);
  if (error) throw error;
  return (data ?? []).map(shapeTranscript);
}

// Admin approval queue: everything awaiting review, worst-first by score.
export async function fetchApprovalQueue(): Promise<TranscriptDetail[]> {
  const { data, error } = await supabase
    .from('transcripts')
    .select(TRANSCRIPT_SELECT)
    .in('status', ['done', 'rejected'])
    .order('quality_score', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []).map(shapeTranscript);
}

export async function approveTranscript(
  id: string,
  editedText?: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const patch: Record<string, unknown> = {
    status: 'approved',
    approved_by: user?.id ?? null,
    approved_at: new Date().toISOString(),
    rejection_note: null,
  };
  if (editedText !== undefined) patch.edited_text = editedText;
  const { error } = await supabase.from('transcripts').update(patch).eq('id', id);
  if (error) throw error;
  await audit('approve_transcript', 'transcript', id, { edited: editedText !== undefined });
}

export async function bulkApprove(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('transcripts')
    .update({
      status: 'approved',
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
    })
    .in('id', ids);
  if (error) throw error;
  await audit('bulk_approve_transcripts', 'transcript', null, { count: ids.length });
}

export async function rejectTranscript(id: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('transcripts')
    .update({ status: 'rejected', rejection_note: note })
    .eq('id', id);
  if (error) throw error;
  await audit('reject_transcript', 'transcript', id, { note });
}

// Facilitator edits their own transcript text (does not change status).
export async function saveTranscriptEdit(
  id: string,
  editedText: string,
): Promise<void> {
  const { error } = await supabase
    .from('transcripts')
    .update({ edited_text: editedText })
    .eq('id', id);
  if (error) throw error;
}

// -- Insights ----------------------------------------------------------------
export interface InsightWithChildren extends InsightRow {
  evidence: (EvidenceRow & { interviewee_name?: string; quality_score?: number })[];
  recommendations: RecommendationRow[];
}

export async function fetchInsights(
  eventId: string,
): Promise<InsightWithChildren[]> {
  const { data: insights, error } = await supabase
    .from('insights')
    .select('*')
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .order('position');
  if (error) throw error;
  if (!insights || insights.length === 0) return [];

  const ids = insights.map((i) => i.id);
  const { data: evidence } = await supabase
    .from('insight_evidence')
    .select('*')
    .in('insight_id', ids);
  const { data: recs } = await supabase
    .from('recommendations')
    .select('*')
    .in('insight_id', ids)
    .is('deleted_at', null);

  return insights.map((i) => ({
    ...i,
    evidence: (evidence ?? []).filter((e) => e.insight_id === i.id),
    recommendations: (recs ?? []).filter((r) => r.insight_id === i.id),
  }));
}

export async function updateInsight(
  id: string,
  patch: { title?: string; body?: string; status?: string },
): Promise<void> {
  const p = { ...patch, status: patch.status ?? 'edited' };
  const { error } = await supabase.from('insights').update(p).eq('id', id);
  if (error) throw error;
}

export async function updateRecommendation(
  id: string,
  body: string,
): Promise<void> {
  const { error } = await supabase
    .from('recommendations')
    .update({ body, status: 'edited' })
    .eq('id', id);
  if (error) throw error;
}

export async function finaliseInsights(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('insights')
    .update({ status: 'final' })
    .eq('event_id', eventId);
  if (error) throw error;
}

// -- Exports -----------------------------------------------------------------
export async function recordExport(
  eventId: string,
  pdfPath: string | null,
  includeTranscripts: boolean,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('exports').insert({
    event_id: eventId,
    pdf_path: pdfPath,
    include_transcripts: includeTranscripts,
    generated_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function hasTranscriptInclusiveExport(
  eventId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('exports')
    .select('id')
    .eq('event_id', eventId)
    .eq('include_transcripts', true)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// -- Misc --------------------------------------------------------------------
export async function signedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export async function getSettings(): Promise<{
  consent_text: string;
  consent_text_version: string;
  audio_retention_days: number;
  auto_approve_threshold: number;
}> {
  const { data } = await supabase
    .from('app_settings')
    .select('consent_text, consent_text_version, audio_retention_days, auto_approve_threshold')
    .single();
  return (
    data ?? {
      consent_text: 'PLACEHOLDER CONSENT TEXT',
      consent_text_version: 'v1',
      audio_retention_days: 90,
      auto_approve_threshold: 85,
    }
  );
}

export async function audit(
  action: string,
  entity: string,
  entityId: string | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from('audit_log').insert({
    actor_id: user?.id ?? null,
    action,
    entity,
    entity_id: entityId,
    detail: detail ?? null,
  });
}
