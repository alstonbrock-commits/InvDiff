import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { LAST_USER_KEY, resetLocalDb } from './db';
import { logOutBilling } from './billing';
import { queryClient } from './queryClient';
import type { Profile } from './types';

WebBrowser.maybeCompleteAuthSession();

// Offline mirror of the profiles row, so a cold start without reception still
// knows who the user is and which role UI to show. Sessions themselves already
// survive offline via SecureStore.
const PROFILE_CACHE_KEY = (userId: string) => `profile-cache:${userId}`;
// Onboarding completion mirrored locally, in case the profile write happened
// offline: the gate honours either flag.
const ONBOARDED_KEY = (userId: string) => `onboarded:${userId}`;

export interface SignupDetails {
  full_name: string;
  job_title: string;
  /** Newsletter opt-out checkbox on the sign-up screen (ticked by default). */
  newsletter_opt_in: boolean;
}

export interface ProfileDetails {
  full_name: string;
  job_title: string;
  newsletter_opt_in?: boolean;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /** True until the persisted session has been read on launch. */
  loading: boolean;
  /** True while the profile row for the current session is being fetched. */
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Self-registration with email + password (no provider account needed). */
  signUpWithEmail: (
    email: string,
    password: string,
    details: SignupDetails,
  ) => Promise<void>;
  /** Google sign-in / sign-up via the PKCE web flow. Resolves without a session if the user backs out. */
  signInWithGoogle: () => Promise<void>;
  /** Native Sign in with Apple (iOS only). Resolves without a session if the user backs out. */
  signInWithApple: () => Promise<void>;
  /** Whether the native Apple button can be shown on this device. */
  appleAvailable: boolean;
  setPassword: (password: string) => Promise<void>;
  /** Emails a 6-digit recovery code (template must include {{ .Token }}). */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Verifies the emailed code; on success a session exists — then setPassword. */
  verifyResetCode: (email: string, code: string) => Promise<void>;
  /** Name / job title / newsletter — the columns the account may edit itself. */
  updateProfileDetails: (details: ProfileDetails) => Promise<void>;
  /** Onboarding slideshow completed (server column + local mirror). */
  onboarded: boolean;
  markOnboarded: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-attempts the profile fetch (used by the retry state in app/index.tsx). */
  retryProfile: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [localOnboarded, setLocalOnboarded] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  // Latest profile fetch wins — a slow earlier fetch must not overwrite a
  // newer one (e.g. the Apple-name update racing the sign-in load).
  const profileSeq = useRef(0);
  const currentUserRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const mySeq = ++profileSeq.current;
    let loaded: Profile | null = null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error || !data) throw error ?? new Error('no profile row');
      loaded = data as Profile;
      await AsyncStorage.setItem(PROFILE_CACHE_KEY(userId), JSON.stringify(data));
    } catch {
      // Offline (or transient failure): fall back to the last known profile so
      // the app still routes instead of dead-ending on a blank screen.
      const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY(userId)).catch(
        () => null,
      );
      loaded = cached ? (JSON.parse(cached) as Profile) : null;
    }
    const flag = await AsyncStorage.getItem(ONBOARDED_KEY(userId)).catch(() => null);
    if (profileSeq.current !== mySeq) return;
    setProfile(loaded);
    setLocalOnboarded(flag === '1');

    // Onboarding finished offline earlier: the server never heard. Retry now.
    if (flag === '1' && loaded && !loaded.onboarded_at) {
      void supabase
        .from('profiles')
        .update({ onboarded_at: new Date().toISOString() })
        .eq('id', userId);
    }
  }, []);

  // The local mirror, outbox, recordings and caches belong to one account.
  // When a different user signs in on this device, wipe them BEFORE the
  // session is published so no screen ever reads the previous account's data.
  const enforceAccountBoundary = useCallback(async (userId: string) => {
    const prev = await AsyncStorage.getItem(LAST_USER_KEY).catch(() => null);
    if (prev && prev !== userId) {
      queryClient.clear();
      await resetLocalDb(userId);
    }
    await AsyncStorage.setItem(LAST_USER_KEY, userId).catch(() => {});
  }, []);

  // Everything that must be true before a session is handed to the app.
  const adopt = useCallback(
    async (newSession: Session) => {
      const uid = newSession.user.id;
      const switching = currentUserRef.current !== uid;
      setProfileLoading(true);
      try {
        if (switching) await enforceAccountBoundary(uid);
        await loadProfile(uid);
      } finally {
        currentUserRef.current = uid;
        setSession(newSession);
        setProfileLoading(false);
      }
    },
    [enforceAccountBoundary, loadProfile],
  );

  const retryProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      setProfileLoading(true);
      try {
        await loadProfile(data.session.user.id);
      } finally {
        setProfileLoading(false);
      }
    }
  }, [loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await adopt(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_e, newSession) => {
        if (newSession) {
          if (currentUserRef.current === newSession.user.id) {
            // Same account (token refresh, user update): keep it cheap.
            setSession(newSession);
            await loadProfile(newSession.user.id);
          } else {
            await adopt(newSession);
          }
        } else {
          currentUserRef.current = null;
          profileSeq.current++;
          setSession(null);
          setProfile(null);
          setLocalOnboarded(false);
        }
      },
    );
    return () => sub.subscription.unsubscribe();
  }, [adopt, loadProfile]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  // Email + password self-registration. The details ride along as user
  // metadata so handle_new_user (migration 0008) writes them onto the profile
  // row at creation — no follow-up update needed.
  const signUpWithEmail = useCallback(
    async (email: string, password: string, details: SignupDetails) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: details.full_name,
            job_title: details.job_title || null,
            newsletter_opt_in: details.newsletter_opt_in,
            terms_accepted_at: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      // Confirmations are off on this project, so a session comes back
      // immediately. If they're ever switched on, say so rather than leaving
      // the user on a screen that looks like it did nothing.
      if (!data.session) {
        throw new Error(
          'Account created — check your email for a confirmation link, then sign in.',
        );
      }
    },
    [],
  );

  // Google via Supabase's hosted OAuth (PKCE): the system browser does the
  // provider dance and returns a ?code= on our deep link, which we exchange
  // for a session. handle_new_user creates the profile from the provider's
  // `name`; job title is collected afterwards on /complete-profile.
  const signInWithGoogle = useCallback(async () => {
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Could not start Google sign-in.');

    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type !== 'success' || !res.url) {
      if (res.type === 'cancel' || res.type === 'dismiss') return; // user backed out
      throw new Error('Sign-in was not completed.');
    }
    const parsed = Linking.parse(res.url);
    const code = (parsed.queryParams?.code as string) ?? null;
    if (!code) throw new Error('No authorization code returned.');
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exErr) throw exErr;
  }, []);

  // Native Sign in with Apple (required by App Review whenever another
  // third-party login is offered). Apple returns the name ONCE, on the first
  // authorisation, so it is written to the profile straight away.
  const signInWithApple = useCallback(async () => {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      throw e;
    }
    if (!credential.identityToken) throw new Error('Apple did not return a token.');

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;

    const name = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const uid = data.user?.id;
    if (name && uid) {
      await supabase.from('profiles').update({ full_name: name }).eq('id', uid);
      await loadProfile(uid);
    }
  }, [loadProfile]);

  // Used on first login after an invite (the invite establishes a session; the
  // user sets a password).
  const setPassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    // OTP flow: the emailed 6-digit code is typed into the app, so no
    // redirect URL is involved (deep links are unreliable from email clients).
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
  }, []);

  const verifyResetCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'recovery',
    });
    if (error) throw error;
  }, []);

  const updateProfileDetails = useCallback(
    async (details: ProfileDetails) => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) throw new Error('Not signed in.');
      const patch: Record<string, unknown> = {
        full_name: details.full_name.trim(),
        job_title: details.job_title.trim(),
        updated_at: new Date().toISOString(),
      };
      if (details.newsletter_opt_in !== undefined) {
        patch.newsletter_opt_in = details.newsletter_opt_in;
        patch.newsletter_opt_in_at = details.newsletter_opt_in
          ? new Date().toISOString()
          : null;
      }
      const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
      if (error) throw error;
      await loadProfile(uid);
    },
    [loadProfile],
  );

  const markOnboarded = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    setLocalOnboarded(true);
    await AsyncStorage.setItem(ONBOARDED_KEY(uid), '1').catch(() => {});
    // Best effort — offline is fine, the local flag carries it and
    // loadProfile retries the server write on the next launch.
    const { error } = await supabase
      .from('profiles')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('id', uid);
    if (!error) await loadProfile(uid);
  }, [loadProfile]);

  // Signing out also clears the device: the local mirror, queued outbox,
  // recordings, query cache and per-account caches all belong to this
  // account, and a different user may sign in next on a shared field device.
  const signOut = useCallback(async () => {
    await logOutBilling();
    await supabase.auth.signOut();
    queryClient.clear();
    await resetLocalDb();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        profileLoading,
        signIn,
        signUpWithEmail,
        signInWithGoogle,
        signInWithApple,
        appleAvailable,
        setPassword,
        requestPasswordReset,
        verifyResetCode,
        updateProfileDetails,
        onboarded: !!profile?.onboarded_at || localOnboarded,
        markOnboarded,
        signOut,
        retryProfile,
        isAdmin: profile?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
