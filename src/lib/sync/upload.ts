// Upload audio recordings and event photos to Storage, then trigger
// transcription. Runs after the outbox has been drained (so the server rows
// exist). Files are read from the device and uploaded as binary.
// SDK 54 moved the classic file API to /legacy; these calls match it 1:1.
import * as FileSystem from 'expo-file-system/legacy';
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

  // Recover rows stranded mid-upload by a crash: 'uploading' is excluded from
  // the pickup filter below, so without this reset they'd be stuck forever.
  // Safe because the engine is single-flight — nothing else is uploading now.
  await db.runAsync(
    `UPDATE answers SET upload_status='pending' WHERE upload_status='uploading'`,
  );

  // Consent signatures are no longer captured (the signing step was removed);
  // any that were taken before that have already uploaded.

  // --- Event photos --------------------------------------------------------
  const photos = await all<{
    id: string;
    storage_path: string;
    local_uri: string;
  }>(
    `SELECT id, storage_path, local_uri FROM event_photos
     WHERE local_uri IS NOT NULL AND deleted_at IS NULL`,
  );
  for (const p of photos) {
    try {
      await uploadFile('event-photos', p.storage_path, p.local_uri, 'image/jpeg');
      await db.runAsync(`UPDATE event_photos SET local_uri=NULL WHERE id=?`, [
        p.id,
      ]);
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
      const lower = a.audio_path.toLowerCase();
      const contentType = lower.endsWith('.wav')
        ? 'audio/wav'
        : lower.endsWith('.mp3')
          ? 'audio/mpeg'
          : 'audio/m4a';
      await uploadFile('audio', a.audio_path, a.local_audio_uri, contentType);

      // Mark uploaded — this write syncs so the facilitator/admin see status.
      // local_audio_uri is KEPT: the file is the device's 7-day fallback copy
      // (the server copy is purged at report time); localAudioSweep deletes it.
      await localUpsert('answers', {
        id: a.id,
        interviewee_id: a.interviewee_id,
        event_question_id: a.event_question_id,
        audio_path: a.audio_path,
        local_audio_uri: a.local_audio_uri,
        duration_ms: a.duration_ms,
        upload_status: 'uploaded',
        recorded_at: a.recorded_at,
        updated_at: nowIso(),
        deleted_at: null,
      });
      audio++;

      // Trigger transcription (best-effort; the job is idempotent). Skip it
      // while this answer's own row is still queued in the outbox — the server
      // would 404 (the row isn't there yet) and this call fires only once.
      // The approve screen re-requests transcription for uploaded answers the
      // server has no transcript for, so a skipped or failed call here heals.
      const queued = await all<{ c: number }>(
        `SELECT COUNT(*) c FROM sync_outbox WHERE row_id=? AND status!='done'`,
        [a.id],
      );
      if ((queued[0]?.c ?? 0) === 0) {
        try {
          await callFunction('transcribe', { answer_id: a.id });
        } catch (e) {
          console.warn(
            `transcribe request failed for ${a.id} — the approve screen will re-request it`,
            e,
          );
        }
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
