import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth';
import { onConnectivityChange } from './connectivity';
import {
  markOnline,
  runSync,
  subscribeSync,
  SyncStatus,
} from './engine';

const SyncContext = createContext<SyncStatus | null>(null);

// The account boundary (wiping the previous user's mirror when a different
// user signs in) is handled in AuthProvider BEFORE the session is published,
// so by the time this provider sees a user id the database is theirs.
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    const unsub = subscribeSync(setStatus);
    // Nothing to push or pull without a signed-in user — every remote call
    // would just 401 against RLS, and the local DB may be mid-wipe.
    if (!userId) return unsub;

    const unsubNet = onConnectivityChange(markOnline);
    void runSync();

    // Re-sync whenever the app returns to the foreground.
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void runSync();
    });

    // Light periodic sync every 30s while foregrounded.
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void runSync();
    }, 30_000);

    return () => {
      unsub();
      unsubNet();
      appSub.remove();
      clearInterval(interval);
    };
  }, [userId]);

  return <SyncContext.Provider value={status}>{children}</SyncContext.Provider>;
}

export function useSyncStatus(): SyncStatus | null {
  return useContext(SyncContext);
}

export { runSync };
