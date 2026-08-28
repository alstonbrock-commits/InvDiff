// Direct Supabase access for ONLINE-only data (transcripts, approvals,
// insights, recommendations, exports). RLS enforces who can see/do what.
import { supabase } from './supabase';
import type {
  EventReportRow,
  EvidenceRow,
  InsightRow,
  RecommendationRow,
  TranscriptStatus,
} from './types';

export interface TranscriptDetail {
  id: string;
  answer_id: string;
  text: string | null;
  edited_text: string | null;
  status: TranscriptStatus;
  rejection_note: string | null;
  interviewee_name: string;
  question_position: number;
  question_text: string;
  event_id: string;
  event_title: string;
}

const TRANSCRIPT_SELECT = `
  id, answer_id, text, edited_text, status, rejection_note,
  answers!inner (
    event_question_id,
    event_questions:event_question_id ( position, text ),
    interviewees!inner ( name, event_id, events!inner ( id, title ) )
  )
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shapeTranscript(r: any): TranscriptDetail {
  const a = r.answers;
  return {
    id: r.id,
    answer_id: r.answer_id,
    text: r.text,
    edited_text: r.edited_text,
    status: r.status,
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
    .eq('answers.interviewees.event_id', eventId)
    // Someone removed from the roster takes their answers with them.
    .is('answers.deleted_at', null)
    .is('answers.interviewees.deleted_at', null);
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
  event_title: string;
  event_date: string | null; // occurred_at, falling back to created_at
  evidence: (EvidenceRow & { interviewee_name?: string })[];
  recommendations: RecommendationRow[];
}

export async function fetchInsights(
  eventId: string,
): Promise<InsightWithChildren[]> {
  const { data: insights, error } = await supabase
    .from('insights')
    .select('*, events!inner ( title, occurred_at, created_at )')
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return insights.map((i: any) => ({
    ...i,
    event_title: i.events.title,
    event_date: i.events.occurred_at ?? i.events.created_at ?? null,
    evidence: (evidence ?? []).filter((e) => e.insight_id === i.id),
    recommendations: (recs ?? [])
      .filter((r) => r.insight_id === i.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  }));
}

// Report-level content for an event: description, executive summary,
// limitations and next steps. Null for events analysed before the report
// structure existed.
export async function fetchEventReport(
  eventId: string,
): Promise<EventReportRow | null> {
  const { data, error } = await supabase
    .from('event_reports')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) return null;
  return (data as EventReportRow) ?? null;
}

// Insights across every event the caller can see (RLS scopes it: facilitators
// get their own events, admins get all). Backs the Insights tab feed.
export interface InsightFeedItem extends InsightRow {
  event_title: string;
  event_site: string | null;
  event_date: string | null; // occurred_at, falling back to created_at
  recommendation_count: number;
  /** Who logged the event — lets a supervisor tell team reports from their own. */
  owner_id: string;
  owner_name: string | null;
}

export async function fetchInsightsFeed(): Promise<InsightFeedItem[]> {
  const { data: insights, error } = await supabase
    .from('insights')
    .select(
      '*, events!inner ( title, site, status, occurred_at, created_at, owner_id, profiles ( full_name, email ) )',
    )
    .is('deleted_at', null)
    .order('generated_at', { ascending: false })
    .order('position');
  if (error) throw error;
  if (!insights || insights.length === 0) return [];

  const ids = insights.map((i) => i.id);
  const { data: recs } = await supabase
    .from('recommendations')
    .select('id, insight_id')
    .in('insight_id', ids)
    .is('deleted_at', null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return insights.map((i: any) => ({
    ...i,
    event_title: i.events.title,
    event_site: i.events.site ?? null,
    event_date: i.events.occurred_at ?? i.events.created_at ?? null,
    recommendation_count: (recs ?? []).filter((r) => r.insight_id === i.id).length,
    owner_id: i.events.owner_id,
    owner_name: i.events.profiles?.full_name || i.events.profiles?.email || null,
  }));
}

// Events with insight generation currently in flight — the ANALYSING card.
export async function fetchAnalysingEvents(): Promise<
  { event_id: string; event_title: string }[]
> {
  // A job whose worker was killed never gets to mark itself errored, so ignore
  // anything older than the reaper's window — otherwise the card spins forever.
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data } = await supabase
    .from('ai_jobs')
    .select('event_id, status, type, created_at, events!inner ( title )')
    .eq('type', 'insights')
    .in('status', ['queued', 'processing'])
    .gte('created_at', cutoff);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((j: any) => ({
    event_id: j.event_id,
    event_title: j.events.title,
  }));
}

// Events whose most recent synthesis failed and that still have no insights —
// the background job's outcome has to be visible somewhere, with a way back in.
export async function fetchFailedInsightEvents(): Promise<
  { event_id: string; event_title: string; owner_id: string; error: string | null; at: string }[]
> {
  const { data } = await supabase
    .from('ai_jobs')
    .select('event_id, status, type, error, created_at, events!inner ( title, owner_id )')
    .eq('type', 'insights')
    .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order('created_at', { ascending: false });
  if (!data || data.length === 0) return [];

  // Only the most recent attempt per event counts. Anything else double-reports:
  // a retry in flight would sit under an ANALYSING card, and a retry that
  // succeeded but legitimately produced no insights would look like a failure
  // for ever.
  const latest = new Map<string, (typeof data)[number]>();
  for (const j of data) if (!latest.has(j.event_id)) latest.set(j.event_id, j);

  return [...latest.values()]
    .filter((j) => j.status === 'error')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((j: any) => ({
      event_id: j.event_id,
      event_title: j.events?.title ?? '',
      owner_id: j.events?.owner_id ?? '',
      error: j.error ?? null,
      at: j.created_at,
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

// -- Newsletter ---------------------------------------------------------------
// Opt-in captured at sign-up (ticked by default) and changeable from Account.
// The timestamp is the record of when the choice was made.
export async function updateNewsletterOptIn(
  profileId: string,
  optIn: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      newsletter_opt_in: optIn,
      newsletter_opt_in_at: new Date().toISOString(),
    })
    .eq('id', profileId);
  if (error) throw error;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  subscribed_at: string | null;
}

// Admin-only mailing list (RLS on profiles scopes it).
export async function fetchNewsletterSubscribers(): Promise<NewsletterSubscriber[]> {
  const { data, error } = await supabase.from('newsletter_subscribers').select('*');
  if (error) throw error;
  return (data ?? []) as NewsletterSubscriber[];
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

export interface AppSettings {
  audio_retention_days: number;
  max_insights: number;
  admin_email: string | null;
  email_notifications: boolean;
}

export async function getSettings(): Promise<AppSettings> {
  const { data } = await supabase.from('app_settings').select('*').single();
  return (
    (data as AppSettings) ?? {
      audio_retention_days: 90,
      max_insights: 5,
      admin_email: null,
      email_notifications: true,
    }
  );
}

// -- Admin (RLS: admin role only for the writes; reads are admin-wide) --------
export async function updateAppSettings(
  patch: Partial<AppSettings>,
): Promise<void> {
  const { error } = await supabase.from('app_settings').update(patch).eq('id', true);
  if (error) throw error;
  await audit('update_settings', 'app_settings', null, patch);
}

export interface DefaultQuestion {
  position: number;
  text: string;
}

export async function fetchDefaultQuestions(): Promise<DefaultQuestion[]> {
  const { data, error } = await supabase
    .from('default_questions')
    .select('position, text')
    .order('position');
  if (error) throw error;
  return (data ?? []) as DefaultQuestion[];
}

export async function updateDefaultQuestion(
  position: number,
  text: string,
): Promise<void> {
  const { error } = await supabase
    .from('default_questions')
    .update({ text })
    .eq('position', position);
  if (error) throw error;
  await audit('update_default_question', 'default_questions', String(position));
}

// ---------------------------------------------------------------------------
// Owner analytics — the admin app is read-only, so everything below is a
// SELECT. The aggregation lives in migration 0017's views so the phone never
// pulls whole tables to count them.
// ---------------------------------------------------------------------------

export interface AdminUsage {
  total_users: number;
  total_events: number;
  total_reports: number;
  total_interviews: number;
  active_1d: number;
  active_7d: number;
  active_30d: number;
  events_30d: number;
  reports_30d: number;
  events_per_active_user_30d: number | null;
  events_per_user: number | null;
  reports_per_user: number | null;
}

export async function fetchAdminUsage(): Promise<AdminUsage> {
  const { data, error } = await supabase.rpc('admin_usage_summary');
  if (error) throw error;
  return data as AdminUsage;
}

export interface AdminUsageDay {
  day: string;
  active_users: number;
  events_created: number;
  reports_finalised: number;
}

export async function fetchAdminUsageDaily(): Promise<AdminUsageDay[]> {
  const { data, error } = await supabase
    .from('admin_usage_daily')
    .select('day, active_users, events_created, reports_finalised')
    .order('day', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AdminUsageDay[];
}

export interface AdminUserMetric {
  id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  role: string;
  created_at: string;
  newsletter_opt_in: boolean;
  events_total: number;
  reports_total: number;
  interviews_total: number;
  answers_recorded: number;
  last_active_at: string | null;
}

export async function fetchAdminUserMetrics(): Promise<AdminUserMetric[]> {
  const { data, error } = await supabase
    .from('admin_user_metrics')
    .select(
      'id, email, full_name, job_title, role, created_at, newsletter_opt_in, ' +
        'events_total, reports_total, interviews_total, answers_recorded, last_active_at',
    )
    .order('last_active_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as AdminUserMetric[];
}

export interface AdminReportItem {
  id: string;
  title: string;
  site: string | null;
  status: string;
  occurred_at: string | null;
  created_at: string;
  owner_id: string | null;
  owner_name: string | null;
  report_generated_at: string | null;
  executive_summary: string | null;
  insight_count: number;
  interviewee_count: number;
  transcript_count: number;
  sort_at: string;
}

// Optionally scoped to one facilitator — the admin Users tab drills into a
// person and shows everything they have produced.
export async function fetchAdminReports(ownerId?: string): Promise<AdminReportItem[]> {
  // .order() returns a transform builder that has no .eq(), so the filter has
  // to go on before the sort.
  const selected = supabase
    .from('admin_report_list')
    .select(
      'id, title, site, status, occurred_at, created_at, owner_id, owner_name, ' +
        'report_generated_at, executive_summary, insight_count, interviewee_count, ' +
        'transcript_count, sort_at',
    );
  const { data, error } = ownerId
    ? await selected.eq('owner_id', ownerId).order('sort_at', { ascending: false })
    : await selected.order('sort_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as AdminReportItem[];
}

// Read-only progress view of an in-flight event, for admin oversight.
export interface AdminEventState {
  interviewees: { id: string; name: string; role_or_segment: string | null }[];
  answers: { interviewee_id: string; recorded_at: string | null; upload_status: string }[];
  transcripts: TranscriptDetail[];
  questionCount: number;
}

export async function fetchAdminEventState(
  eventId: string,
): Promise<AdminEventState> {
  const [people, answers, transcripts, questions] = await Promise.all([
    supabase
      .from('interviewees')
      .select('id, name, role_or_segment')
      .eq('event_id', eventId)
      .is('deleted_at', null),
    supabase
      .from('answers')
      .select('interviewee_id, recorded_at, upload_status, interviewees!inner ( event_id )')
      .eq('interviewees.event_id', eventId)
      .is('deleted_at', null)
      .is('interviewees.deleted_at', null),
    fetchEventTranscripts(eventId),
    supabase
      .from('event_questions')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .is('deleted_at', null),
  ]);
  return {
    interviewees: people.data ?? [],
    answers: answers.data ?? [],
    transcripts,
    questionCount: questions.count ?? 0,
  };
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
