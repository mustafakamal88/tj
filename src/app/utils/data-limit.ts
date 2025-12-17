import type { Trade } from '../types/trade';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds

export const FREE_TRADE_LIMIT = 15;

export const USER_SUBSCRIPTION_KEY = 'user-subscription';
export const USER_TRIAL_START_KEY = 'user-trial-start';

export type SubscriptionPlan = 'free' | 'pro' | 'premium';
export type FreePlanBlockReason = 'trade_limit' | 'trial_expired';

export function getUserSubscription(): SubscriptionPlan {
  const value = localStorage.getItem(USER_SUBSCRIPTION_KEY);
  if (value === 'pro' || value === 'premium' || value === 'free') return value;
  return 'free';
}

export function ensureTrialStart(now = new Date()): string {
  const existing = localStorage.getItem(USER_TRIAL_START_KEY);
  if (existing) {
    const parsed = new Date(existing);
    if (!Number.isNaN(parsed.getTime())) return existing;
  }

  const iso = now.toISOString();
  localStorage.setItem(USER_TRIAL_START_KEY, iso);
  return iso;
}

export function isTrialExpired(trialStartAtIso: string, now = new Date()): boolean {
  const start = new Date(trialStartAtIso);
  if (Number.isNaN(start.getTime())) return false;
  return now.getTime() - start.getTime() > TWO_WEEKS_MS;
}

export function isFreeTrialExpired(now = new Date()): boolean {
  return isTrialExpired(ensureTrialStart(now), now);
}

export function getFreePlanAddTradeBlockReason(
  tradeCount: number,
  now = new Date(),
  trialStartAtIso?: string,
): FreePlanBlockReason | null {
  if (tradeCount >= FREE_TRADE_LIMIT) return 'trade_limit';
  if (trialStartAtIso ? isTrialExpired(trialStartAtIso, now) : isFreeTrialExpired(now)) return 'trial_expired';
  return null;
}

export function getFreePlanAddTradeBlockMessage(reason: FreePlanBlockReason): string {
  switch (reason) {
    case 'trade_limit':
      return `Free plan is limited to ${FREE_TRADE_LIMIT} trades. Upgrade to Pro or Premium to add more.`;
    case 'trial_expired':
      return 'Your 14-day free trial has ended. Upgrade to Pro or Premium to keep adding trades.';
    default: {
      const exhaustiveCheck: never = reason;
      return exhaustiveCheck;
    }
  }
}

export function filterTradesForFreeUser(trades: Trade[]): Trade[] {
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - TWO_WEEKS_MS);
  
  return trades.filter(trade => {
    const tradeDate = new Date(trade.date);
    return tradeDate >= twoWeeksAgo;
  });
}

export function isTradeWithinFreeLimit(tradeDate: string): boolean {
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - TWO_WEEKS_MS);
  const trade = new Date(tradeDate);
  
  return trade >= twoWeeksAgo;
}

export function getDataLimitMessage(): string {
  return `Free plan is limited to the last 2 weeks of data and ${FREE_TRADE_LIMIT} trades (or 14 days). Upgrade to Pro or Premium for unlimited access.`;
}
