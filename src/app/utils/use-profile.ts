import type { ReactNode } from 'react';
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { SubscriptionPlan } from './data-limit';
import { getSupabaseClient } from './supabase';

const DEBUG_PROFILE = (import.meta.env.VITE_DEBUG_PROFILE as string | undefined) === 'true';

export type Profile = {
  id: string;
  email: string;
  isAdmin: boolean;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

type ProfileRow = {
  id: string;
  email: string;
  is_admin: boolean;
  subscription_plan: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

function normalizePlan(value: unknown): SubscriptionPlan {
  const plan = typeof value === 'string' ? value.toLowerCase().trim() : '';
  if (plan === 'pro' || plan === 'premium') return plan;
  return 'free';
}

type ProfileContextValue = {
  profile: Profile | null;
  plan: SubscriptionPlan;
  isActive: boolean;
  loading: boolean;
  refresh: () => Promise<Profile | null>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function useProfileState(): ProfileContextValue {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const refreshSeqRef = useRef(0);

  const refresh = useCallback(async (): Promise<Profile | null> => {
    const seq = ++refreshSeqRef.current;
    const supabase = getSupabaseClient();
    let nextProfile: Profile | null = null;

    if (!supabase) {
      if (!mountedRef.current) return;
      setProfile(null);
      setLoading(false);
      return null;
    }

    if (mountedRef.current) setLoading(true);

    // Never allow UI to be stuck on Loading forever (network hangs, ad-blockers, etc.).
    const loadingTimeout = window.setTimeout(() => {
      if (!mountedRef.current) return;
      if (refreshSeqRef.current !== seq) return;
      console.warn('[useProfile] timed out while loading profile; showing fallback UI');
      setLoading(false);
    }, 8000);

    try {
      // Use getSession() for a fast local check; it avoids a network roundtrip in many cases.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (DEBUG_PROFILE) {
        console.log('[useProfile] getSession', { sessionError, user: sessionData.session?.user ?? null });
      }
      if (sessionError) {
        console.error('[useProfile] auth.getSession failed', sessionError);
      }

      const user = sessionData.session?.user ?? null;
      if (!user) {
        nextProfile = null;
        return null;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,is_admin,subscription_plan,subscription_status,current_period_end,stripe_customer_id,stripe_subscription_id')
        .eq('id', user.id)
        .maybeSingle<ProfileRow>();

      if (DEBUG_PROFILE) {
        console.log('[useProfile] profiles query', { data, error });
      }

      if (error) {
        console.error('[useProfile] profiles select failed', error);
        nextProfile = null;
        return null;
      }

      if (!data) {
        nextProfile = null;
        return null;
      }

      nextProfile = {
        id: data.id,
        email: data.email,
        isAdmin: data.is_admin,
        subscriptionPlan: normalizePlan(data.subscription_plan),
        subscriptionStatus: data.subscription_status ? String(data.subscription_status) : null,
        currentPeriodEnd: data.current_period_end ? String(data.current_period_end) : null,
        stripeCustomerId: data.stripe_customer_id ? String(data.stripe_customer_id) : null,
        stripeSubscriptionId: data.stripe_subscription_id ? String(data.stripe_subscription_id) : null,
      };
    } catch (err) {
      console.error('[useProfile] refresh failed', err);
      nextProfile = null;
    } finally {
      window.clearTimeout(loadingTimeout);
      if (!mountedRef.current) return;
      // Ignore stale refresh results if a newer refresh started.
      if (refreshSeqRef.current !== seq) return;
      setProfile(nextProfile);
      setLoading(false);
    }

    return nextProfile;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const supabase = getSupabaseClient();
    if (!supabase) return () => undefined;

    const { data } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => {
      mountedRef.current = false;
      data.subscription.unsubscribe();
    };
  }, [refresh]);

  const plan = useMemo<SubscriptionPlan>(() => profile?.subscriptionPlan ?? 'free', [profile]);
  const isActive = useMemo<boolean>(() => {
    const status = (profile?.subscriptionStatus ?? '').toLowerCase();
    return status === 'active' || status === 'trialing';
  }, [profile]);

  return { profile, plan, isActive, loading, refresh };
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const value = useProfileState();
  return createElement(ProfileContext.Provider, { value }, children);
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    return {
      profile: null,
      plan: 'free',
      isActive: false,
      loading: false,
      refresh: async () => null,
    };
  }
  return ctx;
}
