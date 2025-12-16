import type { Trade } from '../types/trade';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds

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
  return 'Free plan is limited to the last 2 weeks of data. Upgrade to Pro or Premium for unlimited historical data.';
}
