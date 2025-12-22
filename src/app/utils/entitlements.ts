import type { SubscriptionPlan } from './data-limit';

type EntitlementProfile = {
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: string | null;
  currentPeriodEnd?: string | null;
};

const NON_ENTITLED_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired']);

export function normalizeSubscriptionStatus(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

export function hasPaidEntitlement(profile: EntitlementProfile | null | undefined): boolean {
  if (!profile) return false;

  const plan = profile.subscriptionPlan;
  if (plan !== 'pro' && plan !== 'premium') return false;

  const status = normalizeSubscriptionStatus(profile.subscriptionStatus);
  if (NON_ENTITLED_STATUSES.has(status)) return false;

  return true;
}

export function getEffectivePlan(profile: EntitlementProfile | null | undefined): SubscriptionPlan {
  return hasPaidEntitlement(profile) ? profile!.subscriptionPlan : 'free';
}

