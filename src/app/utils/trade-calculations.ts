import type { Trade, TradeType, TradeOutcome } from '../types/trade';

export function calculatePnL(
  entry: number,
  exit: number,
  quantity: number,
  type: TradeType
): { pnl: number; pnlPercentage: number } {
  let pnl: number;
  
  if (type === 'long') {
    pnl = (exit - entry) * quantity;
  } else {
    pnl = (entry - exit) * quantity;
  }
  
  const pnlPercentage = ((exit - entry) / entry) * 100 * (type === 'long' ? 1 : -1);
  
  return { pnl, pnlPercentage };
}

export function determineOutcome(pnl: number): TradeOutcome {
  if (pnl > 0) return 'win';
  if (pnl < 0) return 'loss';
  return 'breakeven';
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatPercentage(percentage: number): string {
  return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`;
}

export function calculateWinRate(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  const wins = trades.filter(t => t.outcome === 'win').length;
  return (wins / trades.length) * 100;
}

export function calculateTotalPnL(trades: Trade[]): number {
  return trades.reduce((sum, trade) => sum + trade.pnl, 0);
}

export function calculateAveragePnL(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  return calculateTotalPnL(trades) / trades.length;
}

export function calculateProfitFactor(trades: Trade[]): number {
  const totalWins = trades
    .filter(t => t.pnl > 0)
    .reduce((sum, t) => sum + t.pnl, 0);
  const totalLosses = Math.abs(
    trades
      .filter(t => t.pnl < 0)
      .reduce((sum, t) => sum + t.pnl, 0)
  );
  
  if (totalLosses === 0) return totalWins > 0 ? Infinity : 0;
  return totalWins / totalLosses;
}
