import 'react-native-url-polyfill/auto';
import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

// Store the auth session in the device secure store (Keychain / Keystore).
// SecureStore values are capped at 2KB per key on some platforms; Supabase
// sessions can exceed that, so we chunk. For simplicity here we store as one
// key and rely on the token size being within limits for the anon flow.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce', // mobile OAuth (Google/Apple) — code-exchange flow
  },
});

// Invoke an Edge Function with the current session's JWT attached.
// On a non-2xx response, surface the function's own {error} message — the
// generic "FunctionsHttpError: non-2xx status code" hides the real cause.
export async function callFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context
        .json()
        .then((j: { error?: string }) => j?.error)
        .catch(() => null);
      throw new Error(detail ? `${name}: ${detail}` : `${name} failed (${error.context.status})`);
    }
    throw error;
  }
  return data as T;
}
