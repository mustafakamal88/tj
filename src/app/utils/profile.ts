import type { User } from '@supabase/supabase-js';
import type { SubscriptionPlan } from './data-limit';
import { requireSupabaseClient } from './supabase';

export type Profile = {
  id: string;
  email: string;
  fullName: string | null;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: string | null;
  trialStartAt: string;
  isAdmin: boolean;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  subscription_plan: SubscriptionPlan;
  subscription_status: string | null;
  trial_start_at: string;
  is_admin: boolean;
};

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = requireSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,subscription_plan,subscription_status,trial_start_at,is_admin')
    .eq('id', user.id)
    .maybeSingle<ProfileRow>();

  if (error) {
    console.error('[profile] getMyProfile failed', error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    subscriptionPlan: data.subscription_plan,
    subscriptionStatus: data.subscription_status ? String(data.subscription_status) : null,
    trialStartAt: data.trial_start_at,
    isAdmin: data.is_admin,
  };
}

export async function ensureProfile(user: User): Promise<boolean> {
  const supabase = requireSupabaseClient();
  if (!user.email) return false;

  const firstName =
    typeof user.user_metadata?.first_name === 'string' ? (user.user_metadata.first_name as string).trim() : null;
  const lastName =
    typeof user.user_metadata?.last_name === 'string' ? (user.user_metadata.last_name as string).trim() : null;
  const phone =
    typeof user.user_metadata?.phone === 'string' ? (user.user_metadata.phone as string).trim() : null;
  const fullName =
    typeof user.user_metadata?.full_name === 'string' ? (user.user_metadata.full_name as string) : null;

  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      phone,
    },
    { onConflict: 'id' },
  );
  if (error) {
    console.error('[profile] ensureProfile upsert failed', error);
    return false;
  }
  return true;
}

export async function updateMySubscriptionPlan(plan: SubscriptionPlan): Promise<boolean> {
  const supabase = requireSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return false;

  const { error } = await supabase
    .from('profiles')
    .update({ subscription_plan: plan })
    .eq('id', user.id);

  return !error;
}
