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
  | { ok: false; reason: 'trade_limit' | 'trial_expired' | 'not_authenticated' | 'upgrade_required' | 'unknown'; message: string };

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
  close_time?: string | null;
  open_time?: string | null;
  account_login?: string | number | null;
  ticket?: string | number | null;
  position_id?: string | number | null;
  commission?: number | string | null;
  swap?: number | string | null;
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
const toOptionalNumber = (value: number | string | null | undefined): number | undefined => {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'number' ? value : Number(value);
};
const toOptionalString = (value: string | number | null | undefined): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const out = typeof value === 'string' ? value : String(value);
  return out.trim() ? out : undefined;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

function mapTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    date: row.date,
    closeTime: row.close_time ?? undefined,
    openTime: row.open_time ?? undefined,
    accountLogin: toOptionalString(row.account_login),
    ticket: toOptionalString(row.ticket),
    positionId: toOptionalString(row.position_id),
    commission: toOptionalNumber(row.commission),
    swap: toOptionalNumber(row.swap),
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
  try {
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

    if (error) {
      console.error('[trades-api] fetchTrades failed', error);
      return [];
    }
    if (!data) return [];
    return data.map(mapTrade);
  } catch (error) {
    console.error('[trades-api] fetchTrades exception', error);
    return [];
  }
}

async function getMyTradeCount(): Promise<number> {
  try {
    const supabase = requireSupabaseClient();
    const { count, error } = await supabase.from('trades').select('id', { count: 'exact', head: true });
    if (error) {
      console.error('[trades-api] getMyTradeCount failed', error);
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    console.error('[trades-api] getMyTradeCount exception', error);
    return 0;
  }
}

export async function fetchTradesCount(): Promise<number> {
  return getMyTradeCount();
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function fetchTradesPage<T extends TradeRow>(
  builder: (range: { from: number; to: number }) => Promise<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const out: T[] = [];
  const pageSize = 1000;

  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await builder({ from, to: from + pageSize - 1 });
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }

  return out;
}

export async function fetchTradesForCalendarMonth(monthStart: Date, monthEndExclusive: Date): Promise<Trade[]> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return [];

    const startIso = monthStart.toISOString();
    const endIso = monthEndExclusive.toISOString();
    const startDate = toLocalIsoDate(monthStart);
    const endDate = toLocalIsoDate(monthEndExclusive);

    const select =
      'id,date,close_time,open_time,account_login,ticket,position_id,commission,swap,symbol,type,entry,exit,quantity,outcome,pnl,pnl_percentage,notes,emotions,setup,mistakes,screenshots,tags,created_at';

    const withCloseTime = await fetchTradesPage<TradeRow>(({ from, to }) =>
      supabase
        .from('trades')
        .select(select)
        .gte('close_time', startIso)
        .lt('close_time', endIso)
        .order('close_time', { ascending: false })
        .range(from, to)
        .returns<TradeRow[]>(),
    );

    const withOpenTime = await fetchTradesPage<TradeRow>(({ from, to }) =>
      supabase
        .from('trades')
        .select(select)
        .is('close_time', null)
        .gte('open_time', startIso)
        .lt('open_time', endIso)
        .order('open_time', { ascending: false })
        .range(from, to)
        .returns<TradeRow[]>(),
    );

    const withDateOnly = await fetchTradesPage<TradeRow>(({ from, to }) =>
      supabase
        .from('trades')
        .select(select)
        .is('close_time', null)
        .is('open_time', null)
        .gte('date', startDate)
        .lt('date', endDate)
        .order('date', { ascending: false })
        .range(from, to)
        .returns<TradeRow[]>(),
    );

    const merged = [...withCloseTime, ...withOpenTime, ...withDateOnly];
    return merged.map(mapTrade);
  } catch (error) {
    console.error('[trades-api] fetchTradesForCalendarMonth exception', error);
    return [];
  }
}

async function canAddTrades(tradeCountToAdd: number): Promise<AddTradeResult> {
  let profile: Awaited<ReturnType<typeof getMyProfile>> = null;
  try {
    profile = await getMyProfile();
  } catch (error) {
    console.error('[trades-api] getMyProfile exception', error);
    return {
      ok: false,
      reason: 'unknown',
      message: `Failed to read profile: ${errorMessage(error)}`,
    };
  }
  if (!profile) {
    return { ok: false, reason: 'not_authenticated', message: 'Please login to add trades.' };
  }

  const status = (profile.subscriptionStatus ?? '').toLowerCase();
  const paidActive = profile.subscriptionPlan !== 'free' && (status === 'active' || status === 'trialing');
  if (paidActive) return { ok: true };

  // MVP rule: imports (bulk adds) require Pro/Premium even during the trial.
  if (tradeCountToAdd > 1) {
    return { ok: false, reason: 'upgrade_required', message: 'Imports require Pro or Premium.' };
  }

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
  try {
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
  } catch (error) {
    return { ok: false, reason: 'unknown', message: errorMessage(error) };
  }
}

export async function createTrades(trades: TradeInput[]): Promise<AddTradeResult> {
  return createTradesWithProgress(trades);
}

export async function createTradesWithProgress(
  trades: TradeInput[],
  options?: { chunkSize?: number; onProgress?: (p: { inserted: number; total: number }) => void },
): Promise<AddTradeResult> {
  try {
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

    const chunkSize = Math.max(1, Math.min(1000, options?.chunkSize ?? 250));
    let inserted = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from('trades').insert(chunk);
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message };
      }
      inserted += chunk.length;
      options?.onProgress?.({ inserted, total: rows.length });
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'unknown', message: errorMessage(error) };
  }
}

export async function deleteTrade(tradeId: string): Promise<boolean> {
  try {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('trades').delete().eq('id', tradeId);
    if (error) console.error('[trades-api] deleteTrade failed', error);
    return !error;
  } catch (error) {
    console.error('[trades-api] deleteTrade exception', error);
    return false;
  }
}
