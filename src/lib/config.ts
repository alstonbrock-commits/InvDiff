import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '';

export const QUESTIONS_PER_EVENT = 7;
export const MAX_INSIGHTS = 5;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Surface misconfiguration early rather than failing deep in a request.
  console.warn(
    '[config] Supabase URL / anon key missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}
