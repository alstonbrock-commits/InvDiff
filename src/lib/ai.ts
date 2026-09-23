// App-side wrappers over the AI Edge Functions. Keys live server-side; the app
// only ever invokes the functions with the user's JWT.
import { callFunction } from './supabase';

// Queues the synthesis and returns as soon as the job row exists — the work
// itself runs in the background on the server and takes about a minute. Track
// progress through ai_jobs (see fetchAnalysingEvents / fetchFailedInsightEvents),
// never by awaiting this call.
export function generateInsights(eventId: string) {
  return callFunction<{ ok: boolean; job_id: string; status: string }>(
    'generate-insights',
    { event_id: eventId },
  );
}

export function generateRecommendations(eventId: string) {
  return callFunction<{ ok: boolean; count: number }>(
    'generate-recommendations',
    { event_id: eventId },
  );
}

// Best-effort email alert to the admin that an event was logged. The in-app
// feed is guaranteed by a DB trigger; this is the email channel (fires when the
// facilitator is online at finalise time).
export function notifyEventLogged(eventId: string) {
  return callFunction<{ ok: boolean }>('notify-admin', { event_id: eventId });
}
