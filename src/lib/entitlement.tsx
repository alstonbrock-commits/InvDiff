// What the signed-in account is allowed to use.
//
// Source of truth is the server (`my_entitlement()` RPC → organisations /
// subscriptions rows, written by the Stripe and RevenueCat webhooks). Two
// supplements keep the field experience sane:
//   1. an AsyncStorage mirror, so a cold start with no reception still knows
//      the plan is current (`access_until` in the future) and lets the user in;
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
import type { OrgRole } from './types';

export interface OrgEntitlement {
  id: string;
  name: string;
  role: OrgRole | null;
  status: string;
  seat_count: number;
  seats_used: number;
  pending_invites: number;
  current_period_end: string | null;
  supervisor_name: string | null;
}

export interface IndividualEntitlement {
  provider: 'apple' | 'google' | 'stripe' | 'manual';
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
}

export interface Entitlement {
  active: boolean;
  kind: 'admin' | 'org' | 'individual' | 'none';
  access_until: string | null;
  org: OrgEntitlement | null;
  individual: IndividualEntitlement | null;
}

interface EntitlementState {
  /** True until the first server/cache read for this session has settled. */
  loading: boolean;
  entitlement: Entitlement | null;
  /** Whether the account may use the app right now. */
  active: boolean;
  /** True when access comes from the store SDK ahead of the webhook. */
  storeUnlocked: boolean;
  /** Last read came from the offline mirror, not the server. */
  fromCache: boolean;
  refresh: () => Promise<void>;
}

const CACHE_KEY = (userId: string) => `entitlement-cache:${userId}`;
// A poor-but-"reachable" connection can hang the RPC for the platform fetch
// timeout; the gate would show nothing that whole time. Fall back to the
// cache after this.
const RPC_TIMEOUT_MS = 8000;

const EntitlementContext = createContext<EntitlementState | null>(null);

function isCurrent(e: Entitlement | null): boolean {
  if (!e) return false;
  if (e.kind === 'admin') return e.active;
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

  // Re-check the server whenever the app comes back to the foreground and on
  // a slow interval: a plan that lapses mid-session should send the user to
  // the paywall on their next look, and a plan that arrived out-of-band
  // (web purchase) should let them in without a restart.
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
      // Server says yes, or the store SDK says yes and the server is not an
      // organisation account (org members never buy individually).
      active:
        isCurrent(entitlement) ||
        (storeUnlocked && entitlement?.kind !== 'org'),
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
