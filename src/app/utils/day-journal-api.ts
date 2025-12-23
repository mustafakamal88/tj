import type { Trade } from '../types/trade';
import { requireSupabaseClient } from './supabase';

export type DayJournal = {
  id: string;
  userId: string;
  day: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type TradeNote = {
  id: string;
  tradeId: string;
  userId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type TradeMedia = {
  id: string;
  tradeId: string;
  userId: string;
  url: string;
  kind: string;
  createdAt: string;
};

export type DayNews = {
  id: string;
  day: string;
  currency?: string;
  title: string;
  impact?: string;
  time?: string;
  source?: string;
  createdAt: string;
};

export type TradeWithDetails = Trade & {
  note?: TradeNote;
  media: TradeMedia[];
};

export type DayMetrics = {
  totalPnl: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgRR: number;
  biggestWin: number;
  biggestLoss: number;
};

/**
 * Fetch all trades for a specific day
 */
export async function getDayTrades(day: string): Promise<Trade[]> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return [];

    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('date', day)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[day-journal-api] getDayTrades failed', error);
      return [];
    }

    if (!data) return [];

    // Map to Trade type
    return data.map((row: any) => ({
      id: row.id,
      date: row.date,
      closeTime: row.close_time ?? undefined,
      openTime: row.open_time ?? undefined,
      accountLogin: row.account_login ?? undefined,
      ticket: row.ticket ?? undefined,
      positionId: row.position_id ?? undefined,
      commission: row.commission ?? undefined,
      swap: row.swap ?? undefined,
      symbol: row.symbol,
      type: row.type,
      entry: Number(row.entry),
      stopLoss: row.stop_loss ? Number(row.stop_loss) : undefined,
      takeProfit: row.take_profit ? Number(row.take_profit) : undefined,
      exit: Number(row.exit),
      quantity: Number(row.quantity),
      market: row.market ?? undefined,
      size: row.size ? Number(row.size) : undefined,
      sizeUnit: row.size_unit ?? undefined,
      outcome: row.outcome,
      pnl: Number(row.pnl),
      pnlPercentage: Number(row.pnl_percentage),
      notes: row.notes ?? undefined,
      emotions: row.emotions ?? undefined,
      setup: row.setup ?? undefined,
      mistakes: row.mistakes ?? undefined,
      screenshots: row.screenshots ?? undefined,
      tags: row.tags ?? undefined,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('[day-journal-api] getDayTrades exception', error);
    return [];
  }
}

/**
 * Calculate day metrics from trades
 */
export function calculateDayMetrics(trades: Trade[]): DayMetrics {
  const wins = trades.filter((t) => t.outcome === 'win');
  const losses = trades.filter((t) => t.outcome === 'loss');
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;

  // Calculate average RR (simplified: win pnl / loss pnl)
  const avgWinPnl = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
  const avgLossPnl = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) : 0;
  const avgRR = avgLossPnl > 0 ? avgWinPnl / avgLossPnl : 0;

  const biggestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.pnl)) : 0;
  const biggestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.pnl)) : 0;

  return {
    totalPnl,
    tradeCount: trades.length,
    winCount,
    lossCount,
    winRate,
    avgRR,
    biggestWin,
    biggestLoss,
  };
}

/**
 * Fetch day journal for a specific day
 */
export async function getDayJournal(day: string): Promise<DayJournal | null> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return null;

    const { data, error } = await supabase
      .from('day_journals')
      .select('*')
      .eq('user_id', authData.user.id)
      .eq('day', day)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No row found
        return null;
      }
      console.error('[day-journal-api] getDayJournal failed', error);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      day: data.day,
      notes: data.notes || '',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error('[day-journal-api] getDayJournal exception', error);
    return null;
  }
}

/**
 * Create or update day journal
 */
export async function upsertDayJournal(day: string, notes: string): Promise<boolean> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return false;

    const { error } = await supabase
      .from('day_journals')
      .upsert(
        {
          user_id: authData.user.id,
          day,
          notes,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,day',
        }
      );

    if (error) {
      console.error('[day-journal-api] upsertDayJournal failed', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[day-journal-api] upsertDayJournal exception', error);
    return false;
  }
}

/**
 * Fetch trade detail with note and media
 */
export async function getTradeDetail(tradeId: string): Promise<TradeWithDetails | null> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return null;

    // Fetch trade
    const { data: tradeData, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (tradeError || !tradeData) {
      console.error('[day-journal-api] getTradeDetail trade failed', tradeError);
      return null;
    }

    // Fetch trade note
    const { data: noteData } = await supabase
      .from('trade_notes')
      .select('*')
      .eq('trade_id', tradeId)
      .maybeSingle();

    // Fetch trade media
    const { data: mediaData } = await supabase
      .from('trade_media')
      .select('*')
      .eq('trade_id', tradeId)
      .order('created_at', { ascending: true });

    const trade: Trade = {
      id: tradeData.id,
      date: tradeData.date,
      closeTime: tradeData.close_time ?? undefined,
      openTime: tradeData.open_time ?? undefined,
      accountLogin: tradeData.account_login ?? undefined,
      ticket: tradeData.ticket ?? undefined,
      positionId: tradeData.position_id ?? undefined,
      commission: tradeData.commission ?? undefined,
      swap: tradeData.swap ?? undefined,
      symbol: tradeData.symbol,
      type: tradeData.type,
      entry: Number(tradeData.entry),
      stopLoss: tradeData.stop_loss ? Number(tradeData.stop_loss) : undefined,
      takeProfit: tradeData.take_profit ? Number(tradeData.take_profit) : undefined,
      exit: Number(tradeData.exit),
      quantity: Number(tradeData.quantity),
      market: tradeData.market ?? undefined,
      size: tradeData.size ? Number(tradeData.size) : undefined,
      sizeUnit: tradeData.size_unit ?? undefined,
      outcome: tradeData.outcome,
      pnl: Number(tradeData.pnl),
      pnlPercentage: Number(tradeData.pnl_percentage),
      notes: tradeData.notes ?? undefined,
      emotions: tradeData.emotions ?? undefined,
      setup: tradeData.setup ?? undefined,
      mistakes: tradeData.mistakes ?? undefined,
      screenshots: tradeData.screenshots ?? undefined,
      tags: tradeData.tags ?? undefined,
      createdAt: tradeData.created_at,
    };

    const note: TradeNote | undefined = noteData
      ? {
          id: noteData.id,
          tradeId: noteData.trade_id,
          userId: noteData.user_id,
          notes: noteData.notes || '',
          createdAt: noteData.created_at,
          updatedAt: noteData.updated_at,
        }
      : undefined;

    const media: TradeMedia[] = mediaData
      ? mediaData.map((m: any) => ({
          id: m.id,
          tradeId: m.trade_id,
          userId: m.user_id,
          url: m.url,
          kind: m.kind,
          createdAt: m.created_at,
        }))
      : [];

    return {
      ...trade,
      note,
      media,
    };
  } catch (error) {
    console.error('[day-journal-api] getTradeDetail exception', error);
    return null;
  }
}

/**
 * Create or update trade notes
 */
export async function upsertTradeNotes(tradeId: string, notes: string): Promise<boolean> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return false;

    const { error } = await supabase
      .from('trade_notes')
      .upsert(
        {
          trade_id: tradeId,
          user_id: authData.user.id,
          notes,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'trade_id',
        }
      );

    if (error) {
      console.error('[day-journal-api] upsertTradeNotes failed', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[day-journal-api] upsertTradeNotes exception', error);
    return false;
  }
}

/**
 * Upload screenshot and add to trade media
 */
export async function addTradeMedia(tradeId: string, file: File): Promise<string | null> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return null;

    // Upload to storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${authData.user.id}/${tradeId}/${Date.now()}.${fileExt}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('trade-screenshots')
      .upload(fileName, file);

    if (uploadError) {
      console.error('[day-journal-api] addTradeMedia upload failed', uploadError);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('trade-screenshots').getPublicUrl(fileName);

    if (!urlData) {
      console.error('[day-journal-api] addTradeMedia getPublicUrl failed');
      return null;
    }

    const publicUrl = urlData.publicUrl;

    // Insert into trade_media
    const { error: insertError } = await supabase.from('trade_media').insert({
      trade_id: tradeId,
      user_id: authData.user.id,
      url: publicUrl,
      kind: 'screenshot',
    });

    if (insertError) {
      console.error('[day-journal-api] addTradeMedia insert failed', insertError);
      return null;
    }

    return publicUrl;
  } catch (error) {
    console.error('[day-journal-api] addTradeMedia exception', error);
    return null;
  }
}

/**
 * Delete trade media
 */
export async function deleteTradeMedia(mediaId: string): Promise<boolean> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return false;

    // Fetch media to get URL for storage deletion
    const { data: mediaData } = await supabase
      .from('trade_media')
      .select('url')
      .eq('id', mediaId)
      .single();

    // Delete from database
    const { error } = await supabase
      .from('trade_media')
      .delete()
      .eq('id', mediaId)
      .eq('user_id', authData.user.id);

    if (error) {
      console.error('[day-journal-api] deleteTradeMedia failed', error);
      return false;
    }

    // Optionally delete from storage
    if (mediaData?.url) {
      try {
        const urlPath = new URL(mediaData.url).pathname;
        const fileName = urlPath.split('/trade-screenshots/').pop();
        if (fileName) {
          await supabase.storage.from('trade-screenshots').remove([fileName]);
        }
      } catch (err) {
        console.warn('[day-journal-api] deleteTradeMedia storage cleanup failed', err);
      }
    }

    return true;
  } catch (error) {
    console.error('[day-journal-api] deleteTradeMedia exception', error);
    return false;
  }
}

/**
 * Fetch news for a specific day
 */
export async function getDayNews(day: string): Promise<DayNews[]> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return [];

    const { data, error } = await supabase
      .from('day_news')
      .select('*')
      .eq('day', day)
      .order('time', { ascending: true });

    if (error) {
      console.error('[day-journal-api] getDayNews failed', error);
      return [];
    }

    if (!data) return [];

    return data.map((row: any) => ({
      id: row.id,
      day: row.day,
      currency: row.currency ?? undefined,
      title: row.title,
      impact: row.impact ?? undefined,
      time: row.time ?? undefined,
      source: row.source ?? undefined,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('[day-journal-api] getDayNews exception', error);
    return [];
  }
}
