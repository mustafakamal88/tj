import type { SubscriptionPlan } from './data-limit';

export type FeatureId = 'import' | 'mt_sync' | 'advanced_analytics';

export type FeatureAccess = {
  import: boolean;
  mt_sync: boolean;
  advanced_analytics: boolean;
};

export function getFeatureAccess(plan: SubscriptionPlan): FeatureAccess {
  if (plan === 'premium') return { import: true, mt_sync: true, advanced_analytics: true };
  if (plan === 'pro') return { import: true, mt_sync: true, advanced_analytics: true };
  return { import: false, mt_sync: false, advanced_analytics: false };
}

export function requestUpgrade(feature: FeatureId): void {
  window.dispatchEvent(new CustomEvent('open-billing', { detail: { feature } }));
}

