import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Entitlement {
  active: boolean;
  kind: 'admin' | 'org' | 'individual' | 'none';
  access_until: string | null;
  org: {
    id: string;
    name: string;
    role: 'supervisor' | 'member' | null;
    status: string;
    seat_count: number;
    seats_used: number;
    pending_invites: number;
    current_period_end: string | null;
    supervisor_name: string | null;
  } | null;
  individual: {
    provider: 'apple' | 'google' | 'stripe' | 'manual';
    status: string;
    trial_end: string | null;
    current_period_end: string | null;
  } | null;
}

interface AuthState {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, meta: { full_name: string; job_title: string }) => Promise<void>;
  signOut: () => Promise<void>;
  fetchEntitlement: () => Promise<Entitlement | null>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, meta: { full_name: string; job_title: string }) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // terms_accepted_at rides along in the auth metadata as the consent record.
        options: { data: { ...meta, newsletter_opt_in: false, terms_accepted_at: new Date().toISOString() } },
      });
      if (error) throw error;
      if (!data.session) throw new Error('Account created — check your email to confirm it, then sign in.');
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const fetchEntitlement = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_entitlement');
    if (error || !data) return null;
    return data as unknown as Entitlement;
  }, []);

  return (
    <Ctx.Provider value={{ session, loading, signIn, signUp, signOut, fetchEntitlement }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
