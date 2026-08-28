import { createClient, FunctionsHttpError } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!url || !anon) {
  throw new Error(
    'Event Insight web portal: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set at build time (see web/.env.example).',
  );
}

export const supabase = createClient(url ?? '', anon ?? '', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export const APP_STORE_URL = (import.meta.env.VITE_APP_STORE_URL as string | undefined) || '';
export const PLAY_STORE_URL = (import.meta.env.VITE_PLAY_STORE_URL as string | undefined) || '';

// Same shape as the mobile app's callFunction: surface the function's own
// {error} instead of the generic non-2xx message.
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context
        .json()
        .then((j: { error?: string }) => j?.error)
        .catch(() => null);
      throw new Error(detail ? String(detail) : `${name} failed (${error.context.status})`);
    }
    throw error;
  }
  return data as T;
}

export function friendlyError(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  const map: Record<string, string> = {
    no_seats: 'Every seat is taken. Free one, or add seats first.',
    already_member: 'That person is already on the team.',
    in_another_organisation: 'That email belongs to an account in another organisation.',
    already_in_organisation: 'This account already belongs to an organisation.',
    already_subscribed: 'This account already has an active subscription.',
    subscription_inactive: "The organisation's subscription is not active.",
    seats_below_usage: 'You cannot go below the number of seats in use.',
    supervisor_only: 'Only the organisation supervisor can do that.',
    invalid_token: 'This invitation link is not valid.',
    invite_expired: 'This invitation has expired — ask your supervisor for a new one.',
    invite_revoked: 'This invitation was withdrawn — ask your supervisor for a new one.',
    invite_used: 'This invitation has already been used. Sign in on the app instead.',
    cancel_subscription_first: "Cancel your organisation's subscription before deleting the account.",
  };
  for (const k of Object.keys(map)) if (s.includes(k)) return map[k];
  return s;
}
