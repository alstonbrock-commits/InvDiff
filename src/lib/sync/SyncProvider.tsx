import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { onConnectivityChange } from './connectivity';
import {
  markOnline,
  runSync,
  subscribeSync,
  SyncStatus,
} from './engine';

const SyncContext = createContext<SyncStatus | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    const unsub = subscribeSync(setStatus);
    const unsubNet = onConnectivityChange(markOnline);

    // Kick a sync on mount and whenever the app returns to foreground.
    void runSync();
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
  }, []);

  return <SyncContext.Provider value={status}>{children}</SyncContext.Provider>;
}

export function useSyncStatus(): SyncStatus | null {
  return useContext(SyncContext);
}

export { runSync };
