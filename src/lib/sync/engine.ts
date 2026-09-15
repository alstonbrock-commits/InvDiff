// Sync orchestrator: push (outbox) -> upload (audio/signatures) -> pull.
// Guarded by a single-flight lock; only runs when online.
import { drainOutbox, outboxPendingCount, requeueFailed } from './outbox';
import { drainUploads, pendingUploadCount } from './upload';
import { pullAll } from './pull';
import { sweepLocalAudio } from './localAudioSweep';
import { isOnline, refreshConnectivity } from './connectivity';
import { registerSyncWaiter } from '../db';

export interface SyncStatus {
  running: boolean;
  online: boolean;
  pendingRows: number;
  pendingUploads: number;
  lastRunAt: number | null;
  lastError: string | null;
}

let status: SyncStatus = {
  running: false,
  online: true,
  pendingRows: 0,
  pendingUploads: 0,
  lastRunAt: null,
  lastError: null,
};

const listeners = new Set<(s: SyncStatus) => void>();
let inFlight: Promise<void> | null = null;

function emit() {
  listeners.forEach((cb) => cb({ ...status }));
}

export function subscribeSync(cb: (s: SyncStatus) => void): () => void {
  listeners.add(cb);
  cb({ ...status });
  return () => listeners.delete(cb);
}

export function getSyncStatus(): SyncStatus {
  return { ...status };
}

async function refreshCounts() {
  status.pendingRows = await outboxPendingCount();
  status.pendingUploads = await pendingUploadCount();
  emit();
}

// A local-DB wipe waits for the run in progress before closing the handle.
registerSyncWaiter(() => inFlight ?? Promise.resolve());

export async function runSync(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    // Local housekeeping first — needs no network and self-throttles to ~daily.
    try {
      await sweepLocalAudio();
    } catch {
      // never fatal
    }

    status.online = await refreshConnectivity();
    if (!status.online) {
      await refreshCounts();
      return;
    }
    status.running = true;
    status.lastError = null;
    emit();
    try {
      await requeueFailed();      // give previously-failed rows another go
      await drainOutbox();        // 1. push local mutations
      await drainUploads();       // 2. upload audio + signatures, trigger transcribe
      await pullAll();            // 3. pull server changes
      status.lastRunAt = Date.now();
    } catch (e) {
      status.lastError = String(e);
    } finally {
      status.running = false;
      try {
        await refreshCounts();
      } catch {
        // db may be mid-wipe; counts refresh on the next run
      }
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function markOnline(online: boolean) {
  status.online = online;
  emit();
  if (online) void runSync();
}

// Best-effort periodic sync while the app is foregrounded.
export function isBusy(): boolean {
  return status.running || !!inFlight;
}

export { isOnline };
