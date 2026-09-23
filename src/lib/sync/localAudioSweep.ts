// Deletes local recording files once they are no longer needed:
//  1. the event's report has been generated (status 'finalised') more than
//     RETENTION_DAYS ago — the local file was only the fallback copy while
//     the server transcribed the audio and the report settled;
//  2. the answer itself was soft-deleted (person removed from the roster)
//     that long ago;
//  3. the file sits in recordings/ referenced by no answer at all (orphans
//     from crashes or pre-sweep builds that cleared the pointer on upload).
//
// events.updated_at stands in for "report generated at": pulls overwrite it
// with the server trigger value, but that is always >= the finalise push, so
// drift only ever DELAYS deletion — never triggers it early.
//
// Pointer updates use raw SQL, not localUpsert: local_audio_uri is a
// client-only column and housekeeping must not enqueue server traffic.
// Un-uploaded takes (upload_status pending/failed/uploading on a live answer)
// are never touched, regardless of age.
import * as FileSystem from 'expo-file-system/legacy';
import { all, first, getDb, nowIso } from '../db';

const RETENTION_DAYS = 7;
const SWEEP_INTERVAL_MS = 20 * 3600_000; // ~daily, tolerant of app restarts
const STATE_KEY = 'local_audio_sweep';

export async function sweepLocalAudio(): Promise<void> {
  try {
    const state = await first<{ last_pulled_at: string }>(
      `SELECT last_pulled_at FROM sync_state WHERE table_name=?`,
      [STATE_KEY],
    );
    if (
      state?.last_pulled_at &&
      Date.now() - Date.parse(state.last_pulled_at) < SWEEP_INTERVAL_MS
    ) {
      return;
    }

    const db = await getDb();
    const cutoffIso = new Date(
      Date.now() - RETENTION_DAYS * 86_400_000,
    ).toISOString();

    // 1. Reported events: fallback copies past their window.
    const reported = await all<{ id: string; local_audio_uri: string }>(
      `SELECT a.id, a.local_audio_uri FROM answers a
       JOIN interviewees i ON i.id = a.interviewee_id
       JOIN events e ON e.id = i.event_id
       WHERE a.local_audio_uri IS NOT NULL
         AND a.upload_status = 'uploaded'
         AND a.deleted_at IS NULL
         AND e.status = 'finalised'
         AND e.updated_at < ?`,
      [cutoffIso],
    );

    // 2. Soft-deleted answers — nothing will ever upload or replay these.
    const removed = await all<{ id: string; local_audio_uri: string }>(
      `SELECT id, local_audio_uri FROM answers
       WHERE local_audio_uri IS NOT NULL
         AND deleted_at IS NOT NULL AND deleted_at < ?`,
      [cutoffIso],
    );

    for (const row of [...reported, ...removed]) {
      await FileSystem.deleteAsync(row.local_audio_uri, {
        idempotent: true,
      }).catch(() => {});
      await db.runAsync(`UPDATE answers SET local_audio_uri=NULL WHERE id=?`, [
        row.id,
      ]);
    }

    // 3. Orphans in recordings/ that no answer references.
    const dir = `${FileSystem.documentDirectory}recordings`;
    const names = await FileSystem.readDirectoryAsync(dir).catch(
      () => [] as string[],
    );
    if (names.length > 0) {
      const referenced = new Set(
        (
          await all<{ local_audio_uri: string }>(
            `SELECT local_audio_uri FROM answers WHERE local_audio_uri IS NOT NULL`,
          )
        ).map((r) => r.local_audio_uri.split('/').pop()),
      );
      const cutoffSec = (Date.now() - RETENTION_DAYS * 86_400_000) / 1000;
      for (const name of names) {
        if (referenced.has(name)) continue;
        const path = `${dir}/${name}`;
        const info = await FileSystem.getInfoAsync(path).catch(() => null);
        if (
          info?.exists &&
          (info.modificationTime ?? Number.POSITIVE_INFINITY) < cutoffSec
        ) {
          await FileSystem.deleteAsync(path, { idempotent: true }).catch(
            () => {},
          );
        }
      }
    }

    await db.runAsync(
      `INSERT INTO sync_state (table_name, last_pulled_at) VALUES (?, ?)
       ON CONFLICT(table_name) DO UPDATE SET last_pulled_at=excluded.last_pulled_at`,
      [STATE_KEY, nowIso()],
    );
  } catch {
    // Housekeeping only — a sweep failure must never disturb sync.
  }
}
