import type { ReactNode } from 'react';
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { SubscriptionPlan } from './data-limit';
import { getSupabaseClient } from './supabase';

export type Profile = {
  id: string;
  email: string;
  isAdmin: boolean;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
};

type ProfileRow = {
  id: string;
  email: string;
  is_admin: boolean;
  subscription_plan: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
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
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function useProfileState(): ProfileContextValue {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.error('[useProfile] auth.getUser failed', authError);
      }

      const user = authData.user;
      if (!user) {
        if (!mountedRef.current) return;
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,is_admin,subscription_plan,subscription_status,current_period_end')
        .eq('id', user.id)
        .maybeSingle<ProfileRow>();

      if (error) {
        console.error('[useProfile] profiles select failed', error);
        if (!mountedRef.current) return;
        setProfile(null);
        setLoading(false);
        return;
      }

      if (!mountedRef.current) return;
      if (!data) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setProfile({
        id: data.id,
        email: data.email,
        isAdmin: data.is_admin,
        subscriptionPlan: normalizePlan(data.subscription_plan),
        subscriptionStatus: data.subscription_status ? String(data.subscription_status) : null,
        currentPeriodEnd: data.current_period_end ? String(data.current_period_end) : null,
      });
      setLoading(false);
    } catch (err) {
      console.error('[useProfile] refresh failed', err);
      if (!mountedRef.current) return;
      setProfile(null);
      setLoading(false);
    }
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
  const isActive = useMemo<boolean>(
    () => (profile?.subscriptionStatus ?? '').toLowerCase() === 'active',
    [profile],
  );

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
      refresh: async () => {},
    };
  }
  return ctx;
}
