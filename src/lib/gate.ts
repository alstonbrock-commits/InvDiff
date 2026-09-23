// The one place that decides where a signed-in user belongs. app/index.tsx
// follows it on launch, the (tabs) layout follows it while the app is open,
// and each interstitial screen (onboarding, …) bounces back to "/" the moment
// it no longer applies.
//
// Order: login → admin console → complete profile → deactivated? → onboarding
// → app. There is deliberately NO paywall in this chain: everyone gets into
// the app (the first report is free), and once the free report is used the
// app runs in view-only mode — the subscribe screen is opened on demand from
// the locked actions and the Account tab.
import { useAuth } from './auth';

export const ROUTES = {
  login: '/(auth)/login',
  admin: '/(admin)/(dashboard)',
  completeProfile: '/complete-profile',
  inactive: '/account-inactive',
  onboarding: '/onboarding',
  app: '/(tabs)/(dashboard)',
} as const;

export type GateTarget = (typeof ROUTES)[keyof typeof ROUTES];

export interface Gate {
  /** Where the user should be; null while the answer is still loading. */
  target: GateTarget | null;
  loading: boolean;
  /** Session exists but the profile row could not be loaded (offline, no cache). */
  noProfile: boolean;
}

export function useGate(): Gate {
  const { session, profile, loading: authLoading, profileLoading, onboarded } = useAuth();

  if (authLoading) return { target: null, loading: true, noProfile: false };
  if (!session) return { target: ROUTES.login, loading: false, noProfile: false };
  if (!profile) {
    // Still fetching → spinner, not the "couldn't load" card.
    if (profileLoading) return { target: null, loading: true, noProfile: false };
    return { target: null, loading: false, noProfile: true };
  }

  if (profile.role === 'admin') {
    return { target: ROUTES.admin, loading: false, noProfile: false };
  }

  if (!profile.full_name?.trim() || !profile.job_title?.trim()) {
    return { target: ROUTES.completeProfile, loading: false, noProfile: false };
  }

  if (!profile.is_active) {
    return { target: ROUTES.inactive, loading: false, noProfile: false };
  }

  if (!onboarded) return { target: ROUTES.onboarding, loading: false, noProfile: false };

  return { target: ROUTES.app, loading: false, noProfile: false };
}
