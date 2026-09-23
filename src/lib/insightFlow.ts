// The one sequence that turns an event's approved transcripts into its report.
// Shared by the approve screen's post-approval dialog and the roster's
// explicit "Generate insight" button — generation is always user-driven.
import { generateInsights, notifyEventLogged } from './ai';
import { setEventStatus } from './db/queries';
import { runSync } from './sync/SyncProvider';

export async function startInsightGeneration(eventId: string): Promise<void> {
  await generateInsights(eventId);
  await setEventStatus(eventId, 'finalised');
  void runSync();
  void notifyEventLogged(eventId).catch(() => {});
}

// Generation and approval need the network; offline they surface as raw fetch
// errors that read like bugs rather than "no signal".
export function isOfflineError(e: unknown): boolean {
  return /FunctionsFetchError|Failed to send a request|Network request failed|fetch failed/i.test(
    String(e),
  );
}

// The server refuses transcription/synthesis (402) once the plan has lapsed —
// route the user to the paywall instead of showing a raw error.
export function isSubscriptionError(e: unknown): boolean {
  return /subscription_required/i.test(String(e));
}
