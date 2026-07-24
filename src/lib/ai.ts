// App-side wrappers over the AI Edge Functions. Keys live server-side; the app
// only ever invokes the functions with the user's JWT.
import { callFunction } from './supabase';

export function generateInsights(eventId: string) {
  return callFunction<{ ok: boolean; count: number; unapproved: number }>(
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

export function retranscribe(answerId: string) {
  return callFunction<{ ok: boolean; quality_score: number }>('transcribe', {
    answer_id: answerId,
  });
}

export function inviteUser(email: string, fullName: string, role: string) {
  return callFunction<{ ok: boolean; user_id: string }>('invite-user', {
    email,
    full_name: fullName,
    role,
  });
}

export function purgeEventAudio(eventId: string) {
  return callFunction<{ ok: boolean; purged: number }>('purge-event-audio', {
    event_id: eventId,
  });
}
