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
  meta?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type TradeNoteMeta = {
  emotions?: string[];
  mistakes?: string[];
  extraNotes?: string;
};

export type TradeScreenshot = {
  id: string;
  tradeId: string;
  userId: string;
  path: string;
  mimeType?: string;
  sizeBytes: number;
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
  screenshots: TradeScreenshot[];
};

export const TRADE_SCREENSHOTS_BUCKET = 'trade-screenshots';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function toStoragePath(params: { userId: string; tradeId: string; fileName: string }): string {
  const safeName = sanitizeFileName(params.fileName || 'screenshot');
  // IMPORTANT: must match storage RLS policy:
  // <userId>/<tradeId>/<file>
  return `${params.userId}/${params.tradeId}/${Date.now()}-${safeName}`;
}

function summarizeSupabaseError(error: unknown): {
  message?: string;
  statusCode?: number;
  details?: string;
  hint?: string;
  code?: string;
} {
  if (!error || typeof error !== 'object') return {};
  const e = error as any;
  return {
    message: typeof e.message === 'string' ? e.message : undefined,
    statusCode: typeof e.statusCode === 'number' ? e.statusCode : undefined,
    details: typeof e.details === 'string' ? e.details : undefined,
    hint: typeof e.hint === 'string' ? e.hint : undefined,
    code: typeof e.code === 'string' ? e.code : undefined,
  };
}

function isMissingColumnOrSchemaCacheError(error: unknown): boolean {
  const summary = summarizeSupabaseError(error);
  const text = `${summary.message ?? ''} ${summary.details ?? ''} ${summary.hint ?? ''} ${summary.code ?? ''}`.toLowerCase();
  return text.includes('schema cache') || (text.includes('column') && text.includes('does not exist'));
}

export type SignedUrlResult = {
  signedUrl: string;
  expiresAtMs: number;
};

export async function createTradeScreenshotSignedUrl(path: string, expiresInSeconds = 3600): Promise<SignedUrlResult | null> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return null;

    console.info('[day-journal-api] createTradeScreenshotSignedUrl start', {
      bucket: TRADE_SCREENSHOTS_BUCKET,
      path,
      userId: authData.user.id,
      expiresInSeconds,
    });

    const { data, error } = await supabase.storage
      .from(TRADE_SCREENSHOTS_BUCKET)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.error('[day-journal-api] createTradeScreenshotSignedUrl failed', {
        bucket: TRADE_SCREENSHOTS_BUCKET,
        path,
        userId: authData.user.id,
        error: summarizeSupabaseError(error),
      });
      return null;
    }

    console.info('[day-journal-api] createTradeScreenshotSignedUrl ok', {
      bucket: TRADE_SCREENSHOTS_BUCKET,
      path,
      userId: authData.user.id,
      expiresAtMs: Date.now() + expiresInSeconds * 1000,
    });

    return { signedUrl: data.signedUrl, expiresAtMs: Date.now() + expiresInSeconds * 1000 };
  } catch (error) {
    console.error('[day-journal-api] createTradeScreenshotSignedUrl exception', {
      path,
      error,
    });
    return null;
  }
}

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

    const screenshots = await fetchTradeScreenshots(tradeId);

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
          meta: (noteData as any).meta ?? undefined,
          createdAt: noteData.created_at,
          updatedAt: noteData.updated_at,
        }
      : undefined;

    return {
      ...trade,
      note,
      screenshots,
    };
  } catch (error) {
    console.error('[day-journal-api] getTradeDetail exception', error);
    return null;
  }
}

export async function fetchTradeScreenshots(tradeId: string): Promise<TradeScreenshot[]> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return [];

    const { data, error } = await supabase
      .from('trade_screenshots')
      .select('id, trade_id, object_path, path, filename, metadata, size_bytes, created_at, mime_type')
      .eq('trade_id', tradeId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[day-journal-api] fetchTradeScreenshots failed', {
        tradeId,
        userId: authData.user.id,
        error: summarizeSupabaseError(error),
      });
      return [];
    }

    return Array.isArray(data)
      ? data
          .map((s: any) => {
            const normalizedPath = (s.object_path ?? s.path) ? String(s.object_path ?? s.path) : '';
            return {
              id: String(s.id),
              tradeId: String(s.trade_id),
              // `trade_screenshots` may not have a `user_id` column; RLS enforces ownership via trade_id.
              userId: authData.user.id,
              path: normalizedPath,
              mimeType:
                (s.metadata as any)?.mime ??
                (typeof s.mime_type === 'string' ? s.mime_type : undefined),
              sizeBytes: Number(s.size_bytes),
              createdAt: String(s.created_at),
            };
          })
          .filter((s: TradeScreenshot) => Boolean(s.path))
      : [];
  } catch (error) {
    console.error('[day-journal-api] fetchTradeScreenshots exception', { tradeId, error });
    return [];
  }
}

/**
 * Create or update trade notes
 */
export async function upsertTradeNotes(tradeId: string, notes: string, meta?: TradeNoteMeta): Promise<boolean> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return false;

    const payload: any = {
      trade_id: tradeId,
      user_id: authData.user.id,
      notes,
      updated_at: new Date().toISOString(),
    };

    const attempt = async (withMeta: boolean, meta?: unknown) =>
      supabase
        .from('trade_notes')
        .upsert(
          withMeta ? { ...payload, meta } : payload,
          {
            onConflict: 'trade_id',
          }
        );

    // Backwards-compatible: if meta column doesn't exist yet, fall back to notes-only.
    const { error } = await attempt(meta !== undefined, meta);
    if (error) {
      if (meta !== undefined && isMissingColumnOrSchemaCacheError(error)) {
        const { error: retryError } = await attempt(false);
        if (retryError) {
          console.error('[day-journal-api] upsertTradeNotes failed (retry without meta)', retryError);
          return false;
        }
        return true;
      }
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
export type AddTradeScreenshotFailureKind =
  | 'bucket_missing'
  | 'storage_policy'
  | 'db_policy'
  | 'db_error'
  | 'unknown';

export type AddTradeScreenshotResult =
  | { ok: true; path: string }
  | {
      ok: false;
      kind: AddTradeScreenshotFailureKind;
      stage?: 'storage_upload' | 'db_insert' | 'signed_url';
      bucket: string;
      file: { name: string; size: number; type: string };
      path?: string;
      userId?: string;
      error?: ReturnType<typeof summarizeSupabaseError>;
      userMessage?: string;
    };

export async function uploadTradeScreenshot(tradeId: string, file: File): Promise<AddTradeScreenshotResult> {
  const fileName = typeof file?.name === 'string' && file.name.trim() ? file.name : 'screenshot';
  const fileSize = typeof file?.size === 'number' ? file.size : 0;
  const fileType = typeof file?.type === 'string' ? file.type : '';

  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      return {
        ok: false,
        kind: 'unknown',
        stage: 'storage_upload',
        bucket: TRADE_SCREENSHOTS_BUCKET,
        file: { name: fileName, size: fileSize, type: fileType },
      };
    }

    const path = toStoragePath({ userId, tradeId, fileName });

    console.info('[day-journal-api] uploadTradeScreenshot storage upload start', {
      bucket: TRADE_SCREENSHOTS_BUCKET,
      tradeId,
      userId,
      path,
      file: { name: fileName, size: fileSize, type: fileType },
    });

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(TRADE_SCREENSHOTS_BUCKET)
      .upload(path, file, { upsert: false, contentType: fileType || undefined });

    const storedPath = (uploadData as any)?.path ? String((uploadData as any).path) : path;

    if (uploadError) {
      const summary = summarizeSupabaseError(uploadError);
      const msg = (summary.message ?? '').toLowerCase();
      const status = summary.statusCode;
      const kind: AddTradeScreenshotFailureKind =
        status === 404 || msg.includes('bucket') && msg.includes('not') && msg.includes('found')
          ? 'bucket_missing'
          : status === 403 || msg.includes('permission') || msg.includes('policy') || msg.includes('rls')
          ? 'storage_policy'
          : 'unknown';
      console.error('[day-journal-api] uploadTradeScreenshot upload failed', {
        bucket: TRADE_SCREENSHOTS_BUCKET,
        file: { name: fileName, size: fileSize, type: fileType },
        path,
        storedPath,
        uploadData,
        userId,
        error: summary,
      });
      return {
        ok: false,
        kind,
        stage: 'storage_upload',
        bucket: TRADE_SCREENSHOTS_BUCKET,
        file: { name: fileName, size: fileSize, type: fileType },
        path: storedPath,
        userId,
        error: summary,
      };
    }

    console.info('[day-journal-api] uploadTradeScreenshot storage upload ok', {
      bucket: TRADE_SCREENSHOTS_BUCKET,
      tradeId,
      userId,
      requestedPath: path,
      returnedPath: (uploadData as any)?.path,
      fullPath: (uploadData as any)?.fullPath,
      storedPath,
    });

    const insertFull = () =>
      supabase
        .from('trade_screenshots')
        .insert({
          trade_id: tradeId,
          object_path: storedPath,
          filename: fileName,
          metadata: { mime: fileType || undefined },
          size_bytes: fileSize,
        })
        .select('id, trade_id, object_path, path, filename, metadata, size_bytes, created_at')
        .maybeSingle();

    const insertMinimal = () =>
      supabase
        .from('trade_screenshots')
        .insert({
          trade_id: tradeId,
          object_path: storedPath,
          size_bytes: fileSize,
        })
        .select('id, trade_id, object_path, path, filename, metadata, size_bytes, created_at')
        .maybeSingle();

    console.info('[day-journal-api] uploadTradeScreenshot db insert start', {
      table: 'trade_screenshots',
      tradeId,
      userId,
      objectPath: storedPath,
      filename: fileName,
      sizeBytes: fileSize,
      mimeType: fileType,
    });

    let { data: insertedRow, error: insertError } = await insertFull();
    if (insertError && isMissingColumnOrSchemaCacheError(insertError)) {
      ({ data: insertedRow, error: insertError } = await insertMinimal());
    }

    if (insertError) {
      const summary = summarizeSupabaseError(insertError);
      const msg = (summary.message ?? '').toLowerCase();
      const status = summary.statusCode;
      const kind: AddTradeScreenshotFailureKind =
        status === 403 || msg.includes('permission') || msg.includes('policy') || msg.includes('rls')
          ? 'db_policy'
          : 'db_error';

      const codePart = summary.code ? `${summary.code}` : 'no_code';
      const messagePart = summary.message ? `${summary.message}` : 'Unknown error';

      console.error('[day-journal-api] uploadTradeScreenshot DB insert failed', {
        table: 'trade_screenshots',
        bucket: TRADE_SCREENSHOTS_BUCKET,
        file: { name: fileName, size: fileSize, type: fileType },
        objectPath: storedPath,
        userId,
        error: summary,
      });

      return {
        ok: false,
        kind,
        stage: 'db_insert',
        bucket: TRADE_SCREENSHOTS_BUCKET,
        file: { name: fileName, size: fileSize, type: fileType },
        path: storedPath,
        userId,
        error: summary,
        userMessage: `Uploaded to storage but failed to save to DB (${codePart}: ${messagePart}).`,
      };
    }

    const normalizedPath = (insertedRow as any)?.object_path
      ? String((insertedRow as any).object_path)
      : (insertedRow as any)?.path
      ? String((insertedRow as any).path)
      : storedPath;

    console.info('[day-journal-api] uploadTradeScreenshot db insert ok', {
      table: 'trade_screenshots',
      tradeId,
      userId,
      objectPath: normalizedPath,
      inserted: {
        id: (insertedRow as any)?.id,
        object_path: (insertedRow as any)?.object_path,
        path: (insertedRow as any)?.path,
        filename: (insertedRow as any)?.filename,
      },
    });

    // Keep legacy `trades.screenshots` in sync for other UI surfaces.
    try {
      const { data: tradeRow } = await supabase
        .from('trades')
        .select('screenshots')
        .eq('id', tradeId)
        .maybeSingle();

      const current = Array.isArray((tradeRow as any)?.screenshots)
        ? ((tradeRow as any).screenshots as string[]).filter(Boolean)
        : [];
      if (!current.includes(normalizedPath)) {
        await supabase.from('trades').update({ screenshots: [...current, normalizedPath] }).eq('id', tradeId);
      }
    } catch (syncError) {
      console.warn('[day-journal-api] uploadTradeScreenshot trades.screenshots sync failed', {
        tradeId,
        path: normalizedPath,
        userId,
        syncError,
      });
    }

    return { ok: true, path: normalizedPath };
  } catch (error) {
    console.error('[day-journal-api] uploadTradeScreenshot exception', {
      tradeId,
      file: { name: fileName, size: fileSize, type: fileType },
      error,
    });
    return {
      ok: false,
      kind: 'unknown',
      stage: 'storage_upload',
      bucket: TRADE_SCREENSHOTS_BUCKET,
      file: { name: fileName, size: fileSize, type: fileType },
    };
  }
}

/**
 * Delete trade media
 */
export async function deleteTradeScreenshot(screenshotId: string): Promise<boolean> {
  try {
    const supabase = requireSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) return false;

    const { data: shot, error: fetchError } = await supabase
      .from('trade_screenshots')
      .select('id, trade_id, object_path, path')
      .eq('id', screenshotId)
      .single();

    const normalizedPath = (shot as any)?.object_path ?? (shot as any)?.path;
    if (fetchError || !normalizedPath || !(shot as any)?.trade_id) {
      console.error('[day-journal-api] deleteTradeScreenshot fetch failed', {
        screenshotId,
        userId,
        error: summarizeSupabaseError(fetchError),
      });
      return false;
    }

    const path = String(normalizedPath);
    const tradeId = String((shot as any).trade_id);

    const { error: storageError } = await supabase.storage.from(TRADE_SCREENSHOTS_BUCKET).remove([path]);
    if (storageError) {
      console.error('[day-journal-api] deleteTradeScreenshot storage remove failed', {
        screenshotId,
        userId,
        bucket: TRADE_SCREENSHOTS_BUCKET,
        path,
        error: summarizeSupabaseError(storageError),
      });
    }

    const { error: dbError } = await supabase
      .from('trade_screenshots')
      .delete()
      .eq('id', screenshotId);

    if (dbError) {
      console.error('[day-journal-api] deleteTradeScreenshot DB delete failed', {
        screenshotId,
        userId,
        path,
        error: summarizeSupabaseError(dbError),
      });
      return false;
    }

    // Best-effort: keep legacy `trades.screenshots` in sync.
    try {
      const { data: tradeRow } = await supabase
        .from('trades')
        .select('screenshots')
        .eq('id', tradeId)
        .maybeSingle();

      const current = Array.isArray((tradeRow as any)?.screenshots)
        ? ((tradeRow as any).screenshots as string[]).filter(Boolean)
        : [];
      if (current.includes(path)) {
        await supabase.from('trades').update({ screenshots: current.filter((p) => p !== path) }).eq('id', tradeId);
      }
    } catch (syncError) {
      console.warn('[day-journal-api] deleteTradeScreenshot trades.screenshots sync failed', {
        tradeId,
        path,
        userId,
        syncError,
      });
    }

    return true;
  } catch (error) {
    console.error('[day-journal-api] deleteTradeScreenshot exception', {
      screenshotId,
      error,
    });
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
