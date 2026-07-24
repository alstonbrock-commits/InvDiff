// Entity-level operations for the capture path. All writes go through
// localUpsert (SQLite + outbox) so they work offline and sync on reconnect.
import { all, first, localSoftDelete, localUpsert, nowIso, uuid } from './index';
import type {
  AnswerRow,
  EventRow,
  IntervieweeRow,
  QuestionRow,
} from '../types';
import { supabase } from '../supabase';

// The fixed question set (used offline; server copy in default_questions, which
// an admin can edit). Facilitators cannot change these.
export const DEFAULT_QUESTIONS: string[] = [
  'Walk me through what happened. Describe the event.',
  'What surprised you about the event?',
  "Could things have gone worse? And why didn't they?",
  'When this task works well, what must go right?',
  'What frustrates you when you do this task?',
  'What could management better understand about this task?',
  'How could we improve how we do this task?',
];

async function defaultQuestionTexts(): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('default_questions')
      .select('position, text')
      .order('position');
    if (data && data.length === 7) return data.map((d) => d.text);
  } catch {
    // offline — fall through to placeholders
  }
  return DEFAULT_QUESTIONS;
}

// -- Events ------------------------------------------------------------------
export async function createEvent(
  ownerId: string,
  title: string,
  description: string,
): Promise<string> {
  const id = uuid();
  const ts = nowIso();
  await localUpsert('events', {
    id,
    title,
    description: description || null,
    owner_id: ownerId,
    status: 'draft',
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  });

  const texts = await defaultQuestionTexts();
  for (let i = 0; i < 7; i++) {
    await localUpsert('event_questions', {
      id: uuid(),
      event_id: id,
      position: i + 1,
      text: texts[i],
      updated_at: ts,
      deleted_at: null,
    });
  }
  return id;
}

export async function listMyEvents(ownerId: string): Promise<EventRow[]> {
  return all<EventRow>(
    `SELECT * FROM events WHERE owner_id=? AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [ownerId],
  );
}

export async function getEvent(id: string): Promise<EventRow | null> {
  return first<EventRow>(`SELECT * FROM events WHERE id=?`, [id]);
}

export async function setEventStatus(
  id: string,
  status: EventRow['status'],
): Promise<void> {
  const ev = await getEvent(id);
  if (!ev) return;
  await localUpsert('events', { ...ev, status, updated_at: nowIso() });
}

// -- Questions ---------------------------------------------------------------
export async function listQuestions(eventId: string): Promise<QuestionRow[]> {
  return all<QuestionRow>(
    `SELECT * FROM event_questions WHERE event_id=? AND deleted_at IS NULL
     ORDER BY position`,
    [eventId],
  );
}

export async function updateQuestionText(q: QuestionRow, text: string) {
  await localUpsert('event_questions', { ...q, text, updated_at: nowIso() });
}

// -- Interviewees ------------------------------------------------------------
export async function addInterviewee(
  eventId: string,
  name: string,
  roleOrSegment: string,
): Promise<string> {
  const id = uuid();
  await localUpsert('interviewees', {
    id,
    event_id: eventId,
    name,
    role_or_segment: roleOrSegment || null,
    updated_at: nowIso(),
    deleted_at: null,
  });
  return id;
}

export async function listInterviewees(
  eventId: string,
): Promise<IntervieweeRow[]> {
  return all<IntervieweeRow>(
    `SELECT * FROM interviewees WHERE event_id=? AND deleted_at IS NULL
     ORDER BY updated_at`,
    [eventId],
  );
}

export async function getInterviewee(
  id: string,
): Promise<IntervieweeRow | null> {
  return first<IntervieweeRow>(`SELECT * FROM interviewees WHERE id=?`, [id]);
}

export async function deleteInterviewee(id: string) {
  await localSoftDelete('interviewees', id);
}

// -- Consent -----------------------------------------------------------------
export async function hasConsent(intervieweeId: string): Promise<boolean> {
  const row = await first(`SELECT id FROM consents WHERE interviewee_id=?`, [
    intervieweeId,
  ]);
  return !!row;
}

export async function saveConsent(params: {
  intervieweeId: string;
  eventId: string;
  signatureLocalUri: string;
  consentTextVersion: string;
  signedByName: string;
}): Promise<void> {
  const id = uuid();
  const ts = nowIso();
  // The signature file uploads via the upload flow; storage_path convention is
  // <event_id>/consent/<interviewee_id>.png
  const storagePath = `${params.eventId}/consent/${params.intervieweeId}.png`;
  await localUpsert('consents', {
    id,
    interviewee_id: params.intervieweeId,
    signature_path: storagePath,
    signature_local_uri: params.signatureLocalUri,
    consent_text_version: params.consentTextVersion,
    signed_by_name: params.signedByName,
    signed_at: ts,
  });
}

// -- Answers (the grid) ------------------------------------------------------
export async function getAnswer(
  intervieweeId: string,
  questionId: string,
): Promise<AnswerRow | null> {
  return first<AnswerRow>(
    `SELECT * FROM answers WHERE interviewee_id=? AND event_question_id=?`,
    [intervieweeId, questionId],
  );
}

export async function listAnswersForInterviewee(
  intervieweeId: string,
): Promise<AnswerRow[]> {
  return all<AnswerRow>(
    `SELECT * FROM answers WHERE interviewee_id=? AND deleted_at IS NULL`,
    [intervieweeId],
  );
}

export async function listAnswersForEvent(
  eventId: string,
): Promise<AnswerRow[]> {
  return all<AnswerRow>(
    `SELECT a.* FROM answers a
     JOIN interviewees i ON i.id = a.interviewee_id
     WHERE i.event_id=? AND a.deleted_at IS NULL`,
    [eventId],
  );
}

// Save a freshly recorded answer: writes the row and returns the answer id.
// The audio file is queued for upload separately (see sync/uploadQueue).
export async function saveRecordedAnswer(params: {
  intervieweeId: string;
  questionId: string;
  localUri: string;
  durationMs: number;
  eventId: string;
}): Promise<string> {
  const existing = await getAnswer(params.intervieweeId, params.questionId);
  const id = existing?.id ?? uuid();
  const ts = nowIso();
  const storagePath = `${params.eventId}/${params.intervieweeId}/${params.questionId}.m4a`;
  await localUpsert('answers', {
    id,
    interviewee_id: params.intervieweeId,
    event_question_id: params.questionId,
    audio_path: storagePath,
    local_audio_uri: params.localUri,
    duration_ms: params.durationMs,
    upload_status: 'pending',
    recorded_at: ts,
    updated_at: ts,
    deleted_at: null,
  });
  return id;
}

// Progress counts for the event grid header.
export async function eventProgress(eventId: string): Promise<{
  interviewees: number;
  cells: number;
  recorded: number;
  uploaded: number;
}> {
  const iv = await all<{ c: number }>(
    `SELECT COUNT(*) c FROM interviewees WHERE event_id=? AND deleted_at IS NULL`,
    [eventId],
  );
  const q = await all<{ c: number }>(
    `SELECT COUNT(*) c FROM event_questions WHERE event_id=? AND deleted_at IS NULL`,
    [eventId],
  );
  const rec = await all<{ c: number; up: number }>(
    `SELECT COUNT(*) c, SUM(CASE WHEN upload_status='uploaded' THEN 1 ELSE 0 END) up
     FROM answers a JOIN interviewees i ON i.id=a.interviewee_id
     WHERE i.event_id=? AND a.deleted_at IS NULL AND a.recorded_at IS NOT NULL`,
    [eventId],
  );
  const interviewees = iv[0]?.c ?? 0;
  const questions = q[0]?.c ?? 0;
  return {
    interviewees,
    cells: interviewees * questions,
    recorded: rec[0]?.c ?? 0,
    uploaded: rec[0]?.up ?? 0,
  };
}
