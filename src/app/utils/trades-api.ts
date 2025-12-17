import type { Trade, TradeOutcome, TradeType } from '../types/trade';
import {
  FREE_TRADE_LIMIT,
  getFreePlanAddTradeBlockMessage,
  getFreePlanAddTradeBlockReason,
} from './data-limit';
import { getMyProfile } from './profile';
import { requireSupabaseClient } from './supabase';

export type AddTradeResult =
  | { ok: true }
  | { ok: false; reason: 'trade_limit' | 'trial_expired' | 'not_authenticated' | 'unknown'; message: string };

export type TradeInput = {
  date: string;
  symbol: string;
  type: TradeType;
  entry: number;
  exit: number;
  quantity: number;
  outcome: TradeOutcome;
  pnl: number;
  pnlPercentage: number;
  notes?: string;
  emotions?: string;
  setup?: string;
  mistakes?: string;
  screenshots?: string[];
  tags?: string[];
};

type TradeRow = {
  id: string;
  date: string;
  symbol: string;
  type: TradeType;
  entry: number | string;
  exit: number | string;
  quantity: number | string;
  outcome: TradeOutcome;
  pnl: number | string;
  pnl_percentage: number | string;
  notes: string | null;
  emotions: string | null;
  setup: string | null;
  mistakes: string | null;
  screenshots: string[] | null;
  tags: string[] | null;
  created_at: string;
};

const toNumber = (value: number | string): number => (typeof value === 'number' ? value : Number(value));

function mapTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    date: row.date,
    symbol: row.symbol,
    type: row.type,
    entry: toNumber(row.entry),
    exit: toNumber(row.exit),
    quantity: toNumber(row.quantity),
    outcome: row.outcome,
    pnl: toNumber(row.pnl),
    pnlPercentage: toNumber(row.pnl_percentage),
    notes: row.notes ?? undefined,
    emotions: row.emotions ?? undefined,
    setup: row.setup ?? undefined,
    mistakes: row.mistakes ?? undefined,
    screenshots: row.screenshots ?? undefined,
    tags: row.tags ?? undefined,
    createdAt: row.created_at,
  };
}

export async function fetchTrades(): Promise<Trade[]> {
  const supabase = requireSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return [];

  const { data, error } = await supabase
    .from('trades')
    .select(
      'id,date,symbol,type,entry,exit,quantity,outcome,pnl,pnl_percentage,notes,emotions,setup,mistakes,screenshots,tags,created_at',
    )
    .order('date', { ascending: false })
    .returns<TradeRow[]>();

  if (error || !data) return [];
  return data.map(mapTrade);
}

async function getMyTradeCount(): Promise<number> {
  const supabase = requireSupabaseClient();
  const { count } = await supabase
    .from('trades')
    .select('id', { count: 'exact', head: true });

  return count ?? 0;
}

async function canAddTrades(tradeCountToAdd: number): Promise<AddTradeResult> {
  const profile = await getMyProfile();
  if (!profile) {
    return { ok: false, reason: 'not_authenticated', message: 'Please login to add trades.' };
  }

  if (profile.subscriptionPlan !== 'free') return { ok: true };

  const existingCount = await getMyTradeCount();
  const now = new Date();
  const reason = getFreePlanAddTradeBlockReason(existingCount, now, profile.trialStartAt);
  if (reason) {
    return { ok: false, reason, message: getFreePlanAddTradeBlockMessage(reason) };
  }

  if (existingCount + tradeCountToAdd > FREE_TRADE_LIMIT) {
    const remaining = Math.max(0, FREE_TRADE_LIMIT - existingCount);
    return {
      ok: false,
      reason: 'trade_limit',
      message: `Free plan can only save ${FREE_TRADE_LIMIT} trades. You can add ${remaining} more; upgrade to add all.`,
    };
  }

  return { ok: true };
}

export async function createTrade(trade: TradeInput): Promise<AddTradeResult> {
  const supabase = requireSupabaseClient();
  const allowed = await canAddTrades(1);
  if (!allowed.ok) return allowed;

  const { error } = await supabase.from('trades').insert({
    date: trade.date,
    symbol: trade.symbol,
    type: trade.type,
    entry: trade.entry,
    exit: trade.exit,
    quantity: trade.quantity,
    outcome: trade.outcome,
    pnl: trade.pnl,
    pnl_percentage: trade.pnlPercentage,
    notes: trade.notes ?? null,
    emotions: trade.emotions ?? null,
    setup: trade.setup ?? null,
    mistakes: trade.mistakes ?? null,
    screenshots: trade.screenshots ?? null,
    tags: trade.tags ?? null,
  });

  if (error) {
    return { ok: false, reason: 'unknown', message: error.message };
  }

  return { ok: true };
}

export async function createTrades(trades: TradeInput[]): Promise<AddTradeResult> {
  const supabase = requireSupabaseClient();
  if (trades.length === 0) return { ok: true };

  const allowed = await canAddTrades(trades.length);
  if (!allowed.ok) return allowed;

  const rows = trades.map((trade) => ({
    date: trade.date,
    symbol: trade.symbol,
    type: trade.type,
    entry: trade.entry,
    exit: trade.exit,
    quantity: trade.quantity,
    outcome: trade.outcome,
    pnl: trade.pnl,
    pnl_percentage: trade.pnlPercentage,
    notes: trade.notes ?? null,
    emotions: trade.emotions ?? null,
    setup: trade.setup ?? null,
    mistakes: trade.mistakes ?? null,
    screenshots: trade.screenshots ?? null,
    tags: trade.tags ?? null,
  }));

  const { error } = await supabase.from('trades').insert(rows);
  if (error) {
    return { ok: false, reason: 'unknown', message: error.message };
  }

  return { ok: true };
}

export async function deleteTrade(tradeId: string): Promise<boolean> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.from('trades').delete().eq('id', tradeId);
  return !error;
}

