import type { Trade } from '../types/trade';

const STORAGE_KEY = 'trade_journal_data';

export function loadTrades(): Trade[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading trades:', error);
    return [];
  }
}

export function saveTrades(trades: Trade[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch (error) {
    console.error('Error saving trades:', error);
  }
}

export type AddTradeResult =
  | { ok: true }
  | { ok: false; reason: 'trade_limit' | 'trial_expired'; message: string };

export function addTrade(trade: Trade): AddTradeResult {
  const trades = loadTrades();

  trades.push(trade);
  saveTrades(trades);
  return { ok: true };
}

export function updateTrade(tradeId: string, updatedTrade: Trade): void {
  const trades = loadTrades();
  const index = trades.findIndex(t => t.id === tradeId);
  if (index !== -1) {
    trades[index] = updatedTrade;
    saveTrades(trades);
  }
}

export function deleteTrade(tradeId: string): void {
  const trades = loadTrades();
  const filtered = trades.filter(t => t.id !== tradeId);
  saveTrades(filtered);
}
