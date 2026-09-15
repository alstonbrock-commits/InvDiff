// What the signed-in account is allowed to use.
//
// Solo model: one plan (A$19.99/month via Apple / Google Play), and every new
// account may generate ONE report free before subscribing. Source of truth is
// the server (`my_entitlement()` RPC → subscriptions row + the free-report
// flag, written by the RevenueCat webhook and generate-insights). Two
// supplements keep the field experience sane:
//   1. an AsyncStorage mirror, so a cold start with no reception still knows
//      where the account stands;
//   2. RevenueCat's customer info, so a purchase unlocks the app the instant
//      the store confirms it, before the webhook has landed.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './auth';
import { supabase } from './supabase';
import {
  configureBilling,
  getCustomerInfo,
  hasIndividualEntitlement,
  subscribeCustomerInfo,
} from './billing';

export interface IndividualEntitlement {
  provider: 'apple' | 'google' | 'manual';
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
}

export interface Entitlement {
  active: boolean;
  /** 'free' = the one free report is still available; 'none' = view-only. */
  kind: 'admin' | 'individual' | 'free' | 'none';
  free_report_used: boolean;
  access_until: string | null;
  individual: IndividualEntitlement | null;
}

interface EntitlementState {
  /** True until the first server/cache read for this session has settled. */
  loading: boolean;
  entitlement: Entitlement | null;
  /** Whether the account may record and generate right now. */
  active: boolean;
  /** The one free report has been generated. */
  freeReportUsed: boolean;
  /** True when access comes from the store SDK ahead of the webhook. */
  storeUnlocked: boolean;
  /** Last read came from the offline mirror, not the server. */
  fromCache: boolean;
  refresh: () => Promise<void>;
}

const CACHE_KEY = (userId: string) => `entitlement-cache:${userId}`;
// A poor-but-"reachable" connection can hang the RPC for the platform fetch
// timeout; the app would sit blank that whole time. Fall back to the cache.
const RPC_TIMEOUT_MS = 8000;

const EntitlementContext = createContext<EntitlementState | null>(null);

function isCurrent(e: Entitlement | null): boolean {
  if (!e) return false;
  if (e.kind === 'admin') return e.active;
  if (e.kind === 'free') return true;
  if (!e.access_until) return false;
  return Date.parse(e.access_until) > Date.now();
}

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('entitlement timeout')), ms),
    ),
  ]);
}

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [loading, setLoading] = useState(true);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [storeUnlocked, setStoreUnlocked] = useState(false);
  const seq = useRef(0);

  // Resolves true when this call was still the latest for the user (so the
  // caller may clear `loading`); false when a newer load superseded it.
  const load = useCallback(async (uid: string): Promise<boolean> => {
    const mySeq = ++seq.current;
    try {
      const { data, error } = await withTimeout(supabase.rpc('my_entitlement'), RPC_TIMEOUT_MS);
      if (error || !data) throw error ?? new Error('no entitlement');
      if (seq.current !== mySeq) return false;
      const e = data as unknown as Entitlement;
      setEntitlement(e);
      setFromCache(false);
      await AsyncStorage.setItem(CACHE_KEY(uid), JSON.stringify(e)).catch(() => {});
    } catch {
      if (seq.current !== mySeq) return false;
      const cached = await AsyncStorage.getItem(CACHE_KEY(uid)).catch(() => null);
      if (seq.current !== mySeq) return false;
      if (cached) {
        setEntitlement(JSON.parse(cached) as Entitlement);
        setFromCache(true);
      }
      // No cache and no network: leave whatever we had (null on first run).
    }
    return seq.current === mySeq;
  }, []);

  const refresh = useCallback(async () => {
    if (userId) await load(userId);
  }, [userId, load]);

  // Server / cache read per signed-in user.
  useEffect(() => {
    if (!userId) {
      seq.current++;
      setEntitlement(null);
      setStoreUnlocked(false);
      setFromCache(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    void load(userId).then((current) => {
      if (current) setLoading(false);
    });
  }, [userId, load]);

  // Store SDK: identify the user, then mirror entitlement changes. A purchase
  // shows up here immediately; the webhook confirms it server-side moments
  // later, at which point we re-read so the server view wins.
  useEffect(() => {
    if (!userId) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      const ok = await configureBilling(userId);
      if (!ok || cancelled) return;
      const apply = (unlocked: boolean) => {
        if (cancelled) return;
        setStoreUnlocked(unlocked);
        if (unlocked) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void load(userId), 3000);
        }
      };
      apply(hasIndividualEntitlement(await getCustomerInfo()));
      unsub = subscribeCustomerInfo((info) => apply(hasIndividualEntitlement(info)));
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsub?.();
    };
  }, [userId, load]);

  // Re-check the server when the app comes back to the foreground and on a
  // slow interval: a plan that lapses mid-session drops to view-only on the
  // next look, and a plan bought on another device unlocks without a restart.
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => void load(userId), 10 * 60_000);
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void load(userId);
    });
    return () => {
      clearInterval(interval);
      appSub.remove();
    };
  }, [userId, load]);

  const value = useMemo<EntitlementState>(
    () => ({
      loading,
      entitlement,
      active: isCurrent(entitlement) || storeUnlocked,
      freeReportUsed: entitlement?.free_report_used ?? false,
      storeUnlocked,
      fromCache,
      refresh,
    }),
    [loading, entitlement, storeUnlocked, fromCache, refresh],
  );

  return (
    <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>
  );
}

export function useEntitlement(): EntitlementState {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement must be used within EntitlementProvider');
  return ctx;
}
