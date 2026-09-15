import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  rcIosKey?: string;
  rcAndroidKey?: string;
};

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '';

// RevenueCat PUBLIC SDK keys (one per store). Empty = purchases unavailable,
// which the paywall reports instead of crashing.
export const RC_IOS_KEY =
  process.env.EXPO_PUBLIC_RC_IOS_KEY ?? extra.rcIosKey ?? '';
export const RC_ANDROID_KEY =
  process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? extra.rcAndroidKey ?? '';

export const QUESTIONS_PER_EVENT = 7;
export const MAX_INSIGHTS = 5;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Surface misconfiguration early rather than failing deep in a request.
  console.warn(
    '[config] Supabase URL / anon key missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}
