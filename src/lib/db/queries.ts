// Entity-level operations for the capture path. All writes go through
// localUpsert (SQLite + outbox) so they work offline and sync on reconnect.
import { all, first, localSoftDelete, localUpsert, nowIso, uuid } from './index';
import type {
  AnswerRow,
  EventPhotoRow,
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

// Human-facing event ref, derived from the uuid so it's stable offline.
export function displayRef(eventId: string): string {
  return `EVT-${eventId.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

// -- Events ------------------------------------------------------------------
export async function createEvent(
  ownerId: string,
  fields: {
    title: string;
    description: string;
    site: string;
    occurredAt: string | null; // ISO
  },
): Promise<string> {
  const id = uuid();
  const ts = nowIso();
  await localUpsert('events', {
    id,
    title: fields.title,
    description: fields.description || null,
    site: fields.site || null,
    occurred_at: fields.occurredAt,
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

// Events with their interviewee count, for list cards.
export interface EventListItem extends EventRow {
  interviewee_count: number;
}

export async function listMyEventsWithCounts(
  ownerId: string,
): Promise<EventListItem[]> {
  return all<EventListItem>(
    `SELECT e.*,
       (SELECT COUNT(*) FROM interviewees i
         WHERE i.event_id=e.id AND i.deleted_at IS NULL) AS interviewee_count
     FROM events e
     WHERE e.owner_id=? AND e.deleted_at IS NULL
     ORDER BY COALESCE(e.occurred_at, e.created_at) DESC`,
    [ownerId],
  );
}

// Dashboard tiles: finalised = "completed", active = "needing review".
export async function eventStatusCounts(
  ownerId: string,
): Promise<{ finalised: number; active: number }> {
  const rows = await all<{ status: string; c: number }>(
    `SELECT status, COUNT(*) c FROM events
     WHERE owner_id=? AND deleted_at IS NULL GROUP BY status`,
    [ownerId],
  );
  const by = Object.fromEntries(rows.map((r) => [r.status, r.c]));
  return { finalised: by.finalised ?? 0, active: by.active ?? 0 };
}

// Events with local state the server hasn't seen yet (row pushes pending, or
// audio still waiting to upload) — drives the DRAFT · OFFLINE treatment.
export async function unsyncedEventIds(): Promise<Set<string>> {
  const pendingRows = await all<{ row_id: string }>(
    `SELECT DISTINCT row_id FROM sync_outbox
     WHERE table_name='events' AND status='pending'`,
  );
  // local_audio_uri now survives upload (it's the 7-day local fallback copy),
  // so "waiting to upload" must be judged by upload_status, not the pointer.
  const pendingAudio = await all<{ event_id: string }>(
    `SELECT DISTINCT i.event_id FROM answers a
     JOIN interviewees i ON i.id=a.interviewee_id
     WHERE a.local_audio_uri IS NOT NULL AND a.deleted_at IS NULL
       AND a.upload_status IN ('pending','failed','uploading')`,
  );
  return new Set([
    ...pendingRows.map((r) => r.row_id),
    ...pendingAudio.map((r) => r.event_id),
  ]);
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

export async function updateInterviewee(
  id: string,
  name: string,
  roleOrSegment: string,
): Promise<void> {
  const row = await first<IntervieweeRow>(
    `SELECT * FROM interviewees WHERE id=?`,
    [id],
  );
  if (!row) return;
  await localUpsert('interviewees', {
    ...row,
    name,
    role_or_segment: roleOrSegment || null,
    updated_at: nowIso(),
  });
}

// Take someone off the event. Their answers go with them, so counts, the
// roster gate and the AI all stop seeing a person who was never interviewed.
// Soft delete throughout: that is what propagates to other devices.
export async function removeInterviewee(id: string): Promise<void> {
  const answers = await all<{ id: string }>(
    `SELECT id FROM answers WHERE interviewee_id=? AND deleted_at IS NULL`,
    [id],
  );
  for (const a of answers) await localSoftDelete('answers', a.id);
  await localSoftDelete('interviewees', id);
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

// -- Consent -----------------------------------------------------------------
// The in-app consent signature step was removed: facilitators now go straight
// from selecting an interviewee into recording, and obtain consent outside the
// app. The `consents` table and any records captured before this change are
// retained deliberately — they are legal records of past interviews.

// -- Photos ------------------------------------------------------------------
export async function addPhoto(
  eventId: string,
  localUri: string,
  position: number,
): Promise<string> {
  const id = uuid();
  const ts = nowIso();
  await localUpsert('event_photos', {
    id,
    event_id: eventId,
    storage_path: `${eventId}/photos/${id}.jpg`,
    local_uri: localUri,
    position,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  });
  return id;
}

export async function listPhotos(eventId: string): Promise<EventPhotoRow[]> {
  return all<EventPhotoRow>(
    `SELECT * FROM event_photos WHERE event_id=? AND deleted_at IS NULL
     ORDER BY position`,
    [eventId],
  );
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
  // expo-av takes are .m4a; live-caption takes are .wav (or whatever the
  // compressor emits) — keep the real extension so upload content-type and
  // Parakeet's format sniffing line up.
  const match = params.localUri.toLowerCase().match(/\.(wav|mp3|m4a|aac)$/);
  const ext = match?.[1] ?? 'm4a';
  const storagePath = `${params.eventId}/${params.intervieweeId}/${params.questionId}.${ext}`;
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
