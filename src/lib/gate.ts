// The one place that decides where a signed-in user belongs. app/index.tsx
// follows it on launch, the (tabs) layout follows it while the app is open,
// and each interstitial screen (paywall, onboarding, …) bounces back to "/"
// the moment it no longer applies.
//
// Order matters:
//   login → admin console → complete profile → plan gate → onboarding → app
// The admin console is exempt from plans and onboarding. Profile completion
// comes before the paywall so a Google/Apple sign-up with no job title fills
// it in before being asked to pay.
import { useAuth } from './auth';
import { useEntitlement } from './entitlement';

export const ROUTES = {
  login: '/(auth)/login',
  admin: '/(admin)/(dashboard)',
  completeProfile: '/complete-profile',
  paywall: '/paywall',
  inactive: '/subscription-inactive',
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
  const ent = useEntitlement();

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

  if (ent.loading) return { target: null, loading: true, noProfile: false };

  if (!ent.active || !profile.is_active) {
    const orgAccount = profile.org_id !== null || ent.entitlement?.kind === 'org';
    return {
      target: orgAccount || !profile.is_active ? ROUTES.inactive : ROUTES.paywall,
      loading: false,
      noProfile: false,
    };
  }

  if (!onboarded) return { target: ROUTES.onboarding, loading: false, noProfile: false };

  return { target: ROUTES.app, loading: false, noProfile: false };
}
