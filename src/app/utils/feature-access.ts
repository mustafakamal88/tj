import type { SubscriptionPlan } from './data-limit';

export type FeatureId = 'import' | 'broker_import' | 'advanced_analytics';

export type FeatureAccess = {
  import: boolean;
  broker_import: boolean;
  advanced_analytics: boolean;
};

export function getFeatureAccess(plan: SubscriptionPlan): FeatureAccess {
  if (plan === 'premium') return { import: true, broker_import: true, advanced_analytics: true };
  if (plan === 'pro') return { import: true, broker_import: true, advanced_analytics: true };
  return { import: false, broker_import: false, advanced_analytics: false };
}

export function requestUpgrade(feature: FeatureId): void {
  window.dispatchEvent(new CustomEvent('open-billing', { detail: { feature } }));
}
