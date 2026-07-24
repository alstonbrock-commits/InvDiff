// Upload audio recordings and consent signatures to Storage, then trigger
// transcription. Runs after the outbox has been drained (so the server rows
// exist). Files are read from the device and uploaded as binary.
import * as FileSystem from 'expo-file-system';
import { all, getDb, localUpsert, nowIso } from '../db';
import { supabase, callFunction } from '../supabase';
import type { AnswerRow } from '../types';

function base64ToBytes(b64: string): Uint8Array {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = b64.replace(/=+$/, '');
  const len = clean.length;
  const out = new Uint8Array((len * 3) >> 2);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    out[p++] = (a << 2) | (b >> 4);
    if (i + 2 < len) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < len) out[p++] = ((c & 3) << 6) | d;
  }
  return out;
}

async function uploadFile(
  bucket: string,
  path: string,
  localUri: string,
  contentType: string,
): Promise<void> {
  const b64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(b64);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
}

export async function drainUploads(): Promise<{ audio: number; sigs: number }> {
  const db = await getDb();
  let audio = 0;
  let sigs = 0;

  // --- Consent signatures --------------------------------------------------
  const signatures = await all<{
    id: string;
    interviewee_id: string;
    signature_path: string;
    signature_local_uri: string;
  }>(
    `SELECT id, interviewee_id, signature_path, signature_local_uri
     FROM consents WHERE signature_local_uri IS NOT NULL`,
  );
  for (const s of signatures) {
    try {
      await uploadFile(
        'consent-signatures',
        s.signature_path,
        s.signature_local_uri,
        'image/png',
      );
      // Mark uploaded locally (client-only column, no outbox needed).
      await db.runAsync(
        `UPDATE consents SET signature_local_uri=NULL WHERE id=?`,
        [s.id],
      );
      sigs++;
    } catch {
      // leave for next pass
    }
  }

  // --- Audio ---------------------------------------------------------------
  const answers = await all<AnswerRow>(
    `SELECT * FROM answers
     WHERE local_audio_uri IS NOT NULL AND deleted_at IS NULL
       AND upload_status IN ('pending','failed')`,
  );
  for (const a of answers) {
    if (!a.local_audio_uri || !a.audio_path) continue;
    try {
      await db.runAsync(
        `UPDATE answers SET upload_status='uploading' WHERE id=?`,
        [a.id],
      );
      await uploadFile('audio', a.audio_path, a.local_audio_uri, 'audio/m4a');

      // Mark uploaded — this write syncs so the facilitator/admin see status.
      await localUpsert('answers', {
        id: a.id,
        interviewee_id: a.interviewee_id,
        event_question_id: a.event_question_id,
        audio_path: a.audio_path,
        local_audio_uri: null,
        duration_ms: a.duration_ms,
        upload_status: 'uploaded',
        recorded_at: a.recorded_at,
        updated_at: nowIso(),
        deleted_at: null,
      });
      audio++;

      // Trigger transcription (best-effort; the job is idempotent).
      try {
        await callFunction('transcribe', { answer_id: a.id });
      } catch {
        // transcription can be retried later; upload already succeeded
      }
    } catch (e) {
      await db.runAsync(
        `UPDATE answers SET upload_status='failed' WHERE id=?`,
        [a.id],
      );
      void e;
    }
  }

  return { audio, sigs };
}

export async function pendingUploadCount(): Promise<number> {
  const rows = await all<{ c: number }>(
    `SELECT COUNT(*) c FROM answers
     WHERE local_audio_uri IS NOT NULL AND deleted_at IS NULL
       AND upload_status IN ('pending','failed','uploading')`,
  );
  return rows[0]?.c ?? 0;
}
