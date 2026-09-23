import { createClient, FunctionsHttpError } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!url || !anon) {
  throw new Error(
    'Event Insight website: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set at build time (see web/.env.example).',
  );
}

export const supabase = createClient(url, anon, {
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
  if (s.includes('admin_cannot_self_delete')) return 'The administrator account cannot be deleted here.';
  if (s.includes('Invalid login credentials')) return 'Wrong email or password.';
  return s;
}
