import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { Save, TrendingUp, FileText, Image as ImageIcon, ChevronRight, Upload } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Trade } from '../types/trade';
import {
  getDayTrades,
  getDayJournal,
  upsertDayJournal,
  calculateDayMetrics,
  getDayNews,
  getTradeDetail,
  type DayJournal,
  type DayNews,
  type TradeWithDetails,
  uploadTradeScreenshot,
  deleteTradeScreenshot,
  TRADE_SCREENSHOTS_BUCKET,
  upsertTradeNotes,
  type TradeNoteMeta,
} from '../utils/day-journal-api';
import { formatCurrency } from '../utils/trade-calculations';
import { pnlTextClass, semanticColors } from '../utils/semantic-colors';
import { DayNewsBlock } from './day-news-block';
import { TradingViewChart } from './trading-view-chart';
import { ScreenshotGallery } from './screenshot-gallery';
import { toast } from 'sonner';
import { buildTradeNoteExtras, parseTradeNoteExtras } from '../utils/trade-note-extras';

type DayViewDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDay: string | null; // YYYY-MM-DD
};

export function DayViewDrawer({ open, onOpenChange, selectedDay }: DayViewDrawerProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [journal, setJournal] = useState<DayJournal | null>(null);
  const [news, setNews] = useState<DayNews[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingJournal, setSavingJournal] = useState(false);
  const [journalNotes, setJournalNotes] = useState('');
  const [dayNotes, setDayNotes] = useState('');
  const [dayExtrasMarkdown, setDayExtrasMarkdown] = useState('');
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [selectedTradeDetail, setSelectedTradeDetail] = useState<TradeWithDetails | null>(null);
  const [savingTradeNotes, setSavingTradeNotes] = useState(false);
  const [tradeNotes, setTradeNotes] = useState('');
  const [tradeNotesDirty, setTradeNotesDirty] = useState(false);
  const [tradeMeta, setTradeMeta] = useState<TradeNoteMeta>({});
  const [tradeEmotionsText, setTradeEmotionsText] = useState('');
  const [tradeMistakesText, setTradeMistakesText] = useState('');
  const [uploadingTradeShot, setUploadingTradeShot] = useState(false);
  const [tradeShotError, setTradeShotError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<'asia' | 'london' | 'ny' | 'late' | null>(null);
  const [selectedMistake, setSelectedMistake] = useState<string | null>(null);
  const tradeNotesDebounceRef = useRef<number | null>(null);
  const selectedTradeSectionRef = useRef<HTMLDivElement | null>(null);
  const lastSavedTradeNoteKeyRef = useRef<string>('');
  const pendingTradeNoteKeyRef = useRef<string>('');

  const TRADE_EMOTIONS = ['Calm', 'Fear', 'FOMO', 'Revenge', 'Overconfident', 'Hesitation'] as const;
  const TRADE_MISTAKES = ['Entered early', 'No SL', 'Oversized', 'Moved SL', 'Overtraded', "Didn’t follow plan"] as const;

  // Trade note extras helpers live in utils/trade-note-extras.ts

  function splitDayNotesPreserveExtras(raw: string): { main: string; extras: string } {
    const text = raw || '';
    const idx = text.indexOf('\n## Emotions\n');
    if (idx === -1) return { main: text, extras: '' };
    return { main: text.slice(0, idx).trim(), extras: text.slice(idx).trim() };
  }

  const loadDayData = useCallback(async () => {
    if (!selectedDay) return;

    setLoading(true);
    try {
      const [dayTrades, dayJournal, dayNews] = await Promise.all([
        getDayTrades(selectedDay),
        getDayJournal(selectedDay),
        getDayNews(selectedDay),
      ]);

      setTrades(dayTrades);
      setJournal(dayJournal);
      const rawNotes = dayJournal?.notes || '';
      setJournalNotes(rawNotes);
      const split = splitDayNotesPreserveExtras(rawNotes);
      setDayNotes(split.main);
      setDayExtrasMarkdown(split.extras);
      setNews(dayNews);
    } catch (error) {
      console.error('Failed to load day data', error);
      toast.error('Failed to load day data');
    } finally {
      setLoading(false);
    }
  }, [selectedDay]);

  useEffect(() => {
    setSelectedSession(null);
    setSelectedMistake(null);
  }, [selectedDay]);

  const currentTradeNoteKey = useMemo(() => {
    const normalizedExtraNotes = buildTradeNoteExtras({
      emotionsText: tradeEmotionsText,
      mistakesText: tradeMistakesText,
    });
    const emotions = [...(tradeMeta.emotions || [])].sort();
    const mistakes = [...(tradeMeta.mistakes || [])].sort();
    return JSON.stringify({
      notes: tradeNotes || '',
      meta: {
        emotions,
        mistakes,
        extraNotes: normalizedExtraNotes || '',
      },
    });
  }, [tradeNotes, tradeMeta.emotions, tradeMeta.mistakes, tradeEmotionsText, tradeMistakesText]);

  useEffect(() => {
    if (open && selectedDay) {
      loadDayData();
      setSelectedTradeId(null);
      setSelectedTradeDetail(null);
      setTradeNotes('');
      setTradeNotesDirty(false);
      setTradeMeta({});
      setTradeEmotionsText('');
      setTradeMistakesText('');
      setTradeShotError(null);
      lastSavedTradeNoteKeyRef.current = '';
      pendingTradeNoteKeyRef.current = '';
    }
  }, [open, selectedDay, loadDayData]);

  const handleSaveJournal = async () => {
    if (!selectedDay) return;

    setSavingJournal(true);
    try {
      const nextNotes = [dayNotes?.trim() || '', dayExtrasMarkdown?.trim() || ''].filter(Boolean).join('\n\n');
      const success = await upsertDayJournal(selectedDay, nextNotes);
      if (success) {
        toast.success('Journal saved');
        await loadDayData();
      } else {
        toast.error('Failed to save journal');
      }
    } catch (error) {
      console.error('Failed to save journal', error);
      toast.error('Failed to save journal');
    } finally {
      setSavingJournal(false);
    }
  };

  const handleTradeClick = async (trade: Trade) => {
    setSelectedTradeId(trade.id);
    setTradeShotError(null);
    
    try {
      const detail = await getTradeDetail(trade.id);
      setSelectedTradeDetail(detail);
      const serverNotes = detail?.note?.notes || '';
      setTradeNotes(serverNotes);
      setTradeNotesDirty(false);
      const meta = ((detail?.note?.meta as TradeNoteMeta) || {}) as TradeNoteMeta;
      setTradeMeta(meta);
      const parsed = parseTradeNoteExtras(meta.extraNotes);
      setTradeEmotionsText(parsed.emotionsText);
      setTradeMistakesText(parsed.mistakesText);

      // Snapshot guards against accidental saves/toasts on selection.
      const normalizedExtra = buildTradeNoteExtras({
        emotionsText: parsed.emotionsText,
        mistakesText: parsed.mistakesText,
      });
      const emotions = [...(meta.emotions || [])].sort();
      const mistakes = [...(meta.mistakes || [])].sort();
      lastSavedTradeNoteKeyRef.current = JSON.stringify({
        notes: serverNotes,
        meta: {
          emotions,
          mistakes,
          extraNotes: normalizedExtra || '',
        },
      });
      pendingTradeNoteKeyRef.current = '';

      // Auto-scroll selected trade section into view.
      window.setTimeout(() => {
        selectedTradeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    } catch (error) {
      console.error('Failed to load trade detail', error);
      toast.error('Failed to load trade details');
    }
  };

  const handleTradeUpdated = async () => {
    await loadDayData();
    if (selectedTradeId) {
      const detail = await getTradeDetail(selectedTradeId);
      setSelectedTradeDetail(detail);
      const serverNotes = detail?.note?.notes || tradeNotes;
      setTradeNotes(serverNotes);
      setTradeNotesDirty(false);
      const meta = ((detail?.note?.meta as TradeNoteMeta) || tradeMeta) as TradeNoteMeta;
      setTradeMeta(meta);
      const parsed = parseTradeNoteExtras(meta.extraNotes);
      setTradeEmotionsText(parsed.emotionsText);
      setTradeMistakesText(parsed.mistakesText);

      const normalizedExtra = buildTradeNoteExtras({
        emotionsText: parsed.emotionsText,
        mistakesText: parsed.mistakesText,
      });
      const emotions = [...(meta.emotions || [])].sort();
      const mistakes = [...(meta.mistakes || [])].sort();
      lastSavedTradeNoteKeyRef.current = JSON.stringify({
        notes: serverNotes,
        meta: {
          emotions,
          mistakes,
          extraNotes: normalizedExtra || '',
        },
      });
      pendingTradeNoteKeyRef.current = '';
    }
  };

  const handleSaveTradeNotes = async (opts?: { source?: 'manual' | 'autosave' }) => {
    if (!selectedTradeDetail) return;

    const key = currentTradeNoteKey;

    // Only save after user edits.
    if (!tradeNotesDirty) return;

    // Guard: never save if unchanged (prevents loops/toast spam).
    if (key === lastSavedTradeNoteKeyRef.current) {
      setTradeNotesDirty(false);
      return;
    }

    // Guard: avoid duplicate in-flight saves.
    if (pendingTradeNoteKeyRef.current === key) return;

    setSavingTradeNotes(true);
    pendingTradeNoteKeyRef.current = key;
    try {
      const meta: TradeNoteMeta = {
        emotions: tradeMeta.emotions || [],
        mistakes: tradeMeta.mistakes || [],
        extraNotes: buildTradeNoteExtras({ emotionsText: tradeEmotionsText, mistakesText: tradeMistakesText }),
      };
      const success = await upsertTradeNotes(selectedTradeDetail.id, tradeNotes, meta);
      if (success) {
        // Avoid toast spam for autosave.
        if (opts?.source !== 'autosave') toast.success('Trade notes saved');
        lastSavedTradeNoteKeyRef.current = key;
        pendingTradeNoteKeyRef.current = '';
        setTradeNotesDirty(false);
        await handleTradeUpdated();
      } else {
        pendingTradeNoteKeyRef.current = '';
        if (opts?.source !== 'autosave') toast.error('Failed to save trade notes');
      }
    } catch (error) {
      console.error('Failed to save trade notes', error);
      pendingTradeNoteKeyRef.current = '';
      if (opts?.source !== 'autosave') toast.error('Failed to save trade notes');
    } finally {
      setSavingTradeNotes(false);
    }
  };

  // Autosave only after user edits (never on initial render or trade selection).
  useEffect(() => {
    if (!selectedTradeDetail) return;
    if (!tradeNotesDirty) return;

    if (currentTradeNoteKey === lastSavedTradeNoteKeyRef.current) {
      setTradeNotesDirty(false);
      return;
    }

    if (pendingTradeNoteKeyRef.current === currentTradeNoteKey) return;

    if (tradeNotesDebounceRef.current) {
      window.clearTimeout(tradeNotesDebounceRef.current);
    }

    tradeNotesDebounceRef.current = window.setTimeout(() => {
      void handleSaveTradeNotes({ source: 'autosave' });
    }, 800);

    return () => {
      if (tradeNotesDebounceRef.current) {
        window.clearTimeout(tradeNotesDebounceRef.current);
        tradeNotesDebounceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTradeNoteKey, selectedTradeDetail?.id, tradeNotesDirty]);

  const handleTradeScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedTradeDetail) return;

    setTradeShotError(null);
    setUploadingTradeShot(true);
    try {
      const results = await Promise.all(Array.from(files).map((f) => uploadTradeScreenshot(selectedTradeDetail.id, f)));
      const okCount = results.filter((r) => r.ok).length;
      if (okCount > 0) {
        toast.success(`Uploaded ${okCount} screenshot(s)`);
        await handleTradeUpdated();
      }

      const firstFailure = results.find((r) => !r.ok);
      if (firstFailure && firstFailure.ok === false) {
        const failure = firstFailure;
        if (failure.userMessage) {
          setTradeShotError(failure.userMessage);
          toast.error(failure.userMessage);
        } else 
        if (failure.kind === 'bucket_missing') {
          setTradeShotError(`Storage bucket missing (${TRADE_SCREENSHOTS_BUCKET}).`);
          toast.error(`Storage bucket missing (${TRADE_SCREENSHOTS_BUCKET}).`);
        } else if (failure.kind === 'storage_policy' || failure.kind === 'db_policy') {
          setTradeShotError('Permission denied. Check Supabase storage/table policies.');
          toast.error('Permission denied uploading screenshots.');
        } else {
          setTradeShotError('Upload failed. See console for details.');
          toast.error('Screenshot upload failed.');
        }
        console.error('[DayViewDrawer] trade screenshot upload failed', failure);
      }
    } finally {
      setUploadingTradeShot(false);
      e.target.value = '';
    }
  };

  const handleTradeScreenshotDelete = async (screenshotId: string) => {
    if (!confirm('Delete this screenshot?')) return;
    setTradeShotError(null);
    const success = await deleteTradeScreenshot(screenshotId);
    if (success) {
      toast.success('Screenshot deleted');
      await handleTradeUpdated();
    } else {
      setTradeShotError('Delete failed. See console for details.');
      toast.error('Failed to delete screenshot');
    }
  };

  const dayDate = useMemo(() => (selectedDay ? parseISO(selectedDay) : null), [selectedDay]);
  const dayTitle = useMemo(() => (dayDate ? format(dayDate, 'EEE, MMM d, yyyy') : ''), [dayDate]);
  const metrics = useMemo(() => calculateDayMetrics(trades), [trades]);

  const sessionInsights = useMemo(() => {
    const toLocalDate = (t: Trade): Date | null => {
      const time = t.openTime || t.closeTime || t.date;
      const dt =
        typeof time === 'string'
          ? /^\d{4}-\d{2}-\d{2}$/.test(time)
            ? parseISO(time)
            : time.includes('T')
              ? parseISO(time)
              : new Date(time)
          : new Date(time);
      return Number.isFinite(dt.getTime()) ? dt : null;
    };

    const sessionKey = (t: Trade): 'asia' | 'london' | 'ny' | 'late' | null => {
      const dt = toLocalDate(t);
      if (!dt) return null;
      const h = dt.getHours();
      if (h >= 0 && h <= 8) return 'asia';
      if (h >= 9 && h <= 13) return 'london';
      if (h >= 14 && h <= 20) return 'ny';
      if (h >= 21 && h <= 23) return 'late';
      return null;
    };

    const compute = (arr: Trade[]) => {
      const tradesCount = arr.length;
      const totalPnl = arr.reduce((sum, t) => sum + (typeof t.pnl === 'number' ? t.pnl : 0), 0);

      const wins = arr.filter((t) => typeof t.pnl === 'number' && t.pnl > 0);
      const losses = arr.filter((t) => typeof t.pnl === 'number' && t.pnl < 0);
      const denom = wins.length + losses.length;
      const winRate = denom > 0 ? (wins.length / denom) * 100 : null;

      const sumWins = wins.reduce((sum, t) => sum + (t.pnl as number), 0);
      const sumLossAbs = losses.reduce((sum, t) => sum + Math.abs(t.pnl as number), 0);
      const avgWin = wins.length > 0 ? sumWins / wins.length : null;
      const avgLoss = losses.length > 0 ? sumLossAbs / losses.length : null;

      return { tradesCount, totalPnl, winRate, avgWin, avgLoss };
    };

    const buckets: Record<'asia' | 'london' | 'ny' | 'late', Trade[]> = {
      asia: [],
      london: [],
      ny: [],
      late: [],
    };

    for (const t of trades) {
      const key = sessionKey(t);
      if (!key) continue;
      buckets[key].push(t);
    }

    const order: Array<{ key: 'asia' | 'london' | 'ny' | 'late'; label: string }> = [
      { key: 'asia', label: 'Asia' },
      { key: 'london', label: 'London' },
      { key: 'ny', label: 'New York' },
    ];
    if (buckets.late.length > 0) order.push({ key: 'late', label: 'Late' });

    const stats = order.map((s) => ({
      ...s,
      ...compute(buckets[s.key]),
    }));

    return { order, stats, buckets, sessionKey };
  }, [trades]);

  const mistakeInsights = useMemo(() => {
    const titleize = (value: string) => {
      const cleaned = value
        .trim()
        .replace(/^#+/, '')
        .replace(/^mistake[_-]?/i, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      if (!cleaned) return '';
      return cleaned.replace(/\b\w/g, (m) => m.toUpperCase());
    };

    const extract = (t: Trade): string[] => {
      const out: string[] = [];

      const metaMistakes = (t as any)?.note?.meta?.mistakes ?? (t as any)?.meta?.mistakes;
      if (Array.isArray(metaMistakes)) {
        for (const m of metaMistakes) {
          const label = titleize(String(m || ''));
          if (label) out.push(label);
        }
      }

      const direct = (t as any)?.mistakes;
      if (Array.isArray(direct)) {
        for (const m of direct) {
          const label = titleize(String(m || ''));
          if (label) out.push(label);
        }
      } else if (typeof direct === 'string') {
        for (const m of direct.split(/[\n,;]+/g)) {
          const label = titleize(m);
          if (label) out.push(label);
        }
      }

      const tags = Array.isArray((t as any)?.tags) ? ((t as any).tags as unknown[]) : [];
      for (const raw of tags) {
        const tag = String(raw || '').trim();
        if (!tag) continue;
        const m = tag.match(/^mistake[:_\-](.+)$/i);
        if (m?.[1]) {
          const label = titleize(m[1]);
          if (label) out.push(label);
        }
        const hashMatches = [...tag.matchAll(/#mistake[_-]([a-z0-9_\-]+)/gi)];
        for (const hm of hashMatches) {
          const label = titleize(hm[1] || '');
          if (label) out.push(label);
        }
      }

      const notesText =
        (t as any)?.note?.notes ||
        (t as any)?.notes ||
        '';
      if (typeof notesText === 'string' && notesText.trim()) {
        const lines = notesText.split(/\r?\n/);
        for (const line of lines) {
          const m = line.match(/^\s*mistakes?\s*:\s*(.+)\s*$/i);
          if (m?.[1]) {
            for (const chunk of m[1].split(/[,;]+/g)) {
              const label = titleize(chunk);
              if (label) out.push(label);
            }
          }
          const hashMatches = [...line.matchAll(/#mistake[_-]([a-z0-9_\-]+)/gi)];
          for (const hm of hashMatches) {
            const label = titleize(hm[1] || '');
            if (label) out.push(label);
          }
        }
      }

      // Deduplicate within a trade so counts represent occurrences across trades.
      return [...new Set(out)];
    };

    const tradeToMistakes = new Map<string, string[]>();
    const counts = new Map<string, number>();
    let tradesWithAnyMistake = 0;
    let totalMistakesCount = 0;

    for (const t of trades) {
      const mistakes = extract(t);
      tradeToMistakes.set(t.id, mistakes);
      if (mistakes.length > 0) {
        tradesWithAnyMistake += 1;
        totalMistakesCount += mistakes.length;
        for (const m of mistakes) counts.set(m, (counts.get(m) ?? 0) + 1);
      }
    }

    const uniqueMistakesCount = counts.size;
    const topMistakes = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, count]) => ({ label, count }));

    const mistakeRate = trades.length > 0 ? (tradesWithAnyMistake / trades.length) * 100 : null;

    return {
      tradeToMistakes,
      tradesWithAnyMistake,
      totalMistakesCount,
      uniqueMistakesCount,
      topMistakes,
      mistakeRate,
    };
  }, [trades]);

  const hasActiveFilters = Boolean(selectedSession || selectedMistake);

  const visibleTrades = useMemo(() => {
    let list = trades;
    if (selectedSession) {
      list = list.filter((t) => sessionInsights.sessionKey(t) === selectedSession);
    }
    if (selectedMistake) {
      list = list.filter((t) => (mistakeInsights.tradeToMistakes.get(t.id) ?? []).includes(selectedMistake));
    }
    return list;
  }, [trades, selectedSession, selectedMistake, sessionInsights, mistakeInsights.tradeToMistakes]);

  const dayInsights = useMemo(() => {
    const tradeCount = trades.length;
    if (tradeCount === 0) {
      return {
        biggestWin: null as null | { pnl: number; symbol: string },
        biggestLoss: null as null | { pnl: number; symbol: string },
        netR: null as null | number,
        topTags: [] as Array<{ label: string; count: number }>,
      };
    }

    let biggestWin: null | { pnl: number; symbol: string } = null;
    let biggestLoss: null | { pnl: number; symbol: string } = null;

    for (const t of trades) {
      if (typeof t.pnl !== 'number') continue;
      if (!biggestWin || t.pnl > biggestWin.pnl) biggestWin = { pnl: t.pnl, symbol: t.symbol };
      if (!biggestLoss || t.pnl < biggestLoss.pnl) biggestLoss = { pnl: t.pnl, symbol: t.symbol };
    }

    // Net R (sum of R-multiples) when risk can be inferred.
    let netR: number | null = null;
    let netRCount = 0;
    for (const t of trades) {
      const entry = typeof t.entry === 'number' ? t.entry : null;
      const sl = typeof t.stopLoss === 'number' ? t.stopLoss : null;
      const qty = typeof t.quantity === 'number' ? t.quantity : null;
      const pnl = typeof t.pnl === 'number' ? t.pnl : null;
      if (entry === null || sl === null || qty === null || pnl === null) continue;
      const riskDistance = Math.abs(entry - sl);
      const riskAmount = riskDistance > 0 ? riskDistance * qty : 0;
      if (!Number.isFinite(riskAmount) || riskAmount <= 0) continue;
      const r = pnl / riskAmount;
      if (!Number.isFinite(r)) continue;
      netR = (netR ?? 0) + r;
      netRCount += 1;
    }
    if (netRCount === 0) netR = null;

    const counts = new Map<string, number>();
    for (const t of trades) {
      if (Array.isArray(t.tags)) {
        for (const raw of t.tags) {
          const label = String(raw || '').trim();
          if (!label) continue;
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }
      }
      const setup = String((t as any).setup || '').trim();
      if (setup) counts.set(setup, (counts.get(setup) ?? 0) + 1);
    }

    const topTags = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    return { biggestWin, biggestLoss, netR, topTags };
  }, [trades]);

  if (!selectedDay) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[640px] lg:max-w-[900px] p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="p-4 border-b bg-muted/30">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-2xl mb-2">{dayTitle}</SheetTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant={metrics.totalPnl >= 0 ? 'default' : 'destructive'}>
                  P/L: {formatCurrency(metrics.totalPnl)}
                </Badge>
                <Badge variant="outline">{metrics.tradeCount} trades</Badge>
                <Badge variant="outline">WR: {metrics.winRate.toFixed(0)}%</Badge>
                {metrics.avgRR > 0 && (
                  <Badge variant="outline">Avg RR: {metrics.avgRR.toFixed(2)}</Badge>
                )}
              </div>
            </div>

            {/* Close button is provided by SheetContent (single X in top-right). */}
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="px-4 pb-6 space-y-4">
              {/* 1) Chart (large card) */}
              <div className="pt-4">
                <h3 className="font-semibold mb-3 text-sm">Chart</h3>
                <TradingViewChart
                  symbol={selectedTradeDetail?.symbol || (trades.length > 0 ? trades[0].symbol : 'XAUUSD')}
                  heightClassName="h-[280px] sm:h-[320px] lg:h-[400px] xl:h-[440px]"
                />
              </div>

              {/* 2) Trades Taken (card) */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Trades Taken
                </h3>
                {trades.length === 0 ? (
                  <Card className="p-6 text-center text-muted-foreground">
                    <p>No trades on this day</p>
                  </Card>
                ) : visibleTrades.length === 0 ? (
                  <Card className="p-6 text-center text-muted-foreground">
                    <p>No trades match the current filters.</p>
                    {hasActiveFilters ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => {
                          setSelectedSession(null);
                          setSelectedMistake(null);
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : null}
                  </Card>
                ) : (
                  <Card className="p-0 overflow-hidden">
                    <div className="divide-y divide-border">
                      {visibleTrades.map((trade) => {
                        const isSelected = selectedTradeId === trade.id;
                        const matchesMistake =
                          selectedMistake && (mistakeInsights.tradeToMistakes.get(trade.id) ?? []).includes(selectedMistake);
                        return (
                          <button
                            key={trade.id}
                            type="button"
                            className={`w-full text-left p-4 transition-colors ${
                              isSelected ? 'bg-accent' : 'hover:bg-accent'
                            } ${matchesMistake ? 'ring-1 ring-primary/25' : ''}`}
                            data-matches-mistake={matchesMistake ? 'true' : 'false'}
                            onClick={() => handleTradeClick(trade)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="font-semibold">{trade.symbol}</span>
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${
                                      trade.type === 'long' ? semanticColors.longChipClasses : semanticColors.shortChipClasses
                                    }`}
                                  >
                                    {trade.type.toUpperCase()}
                                  </Badge>
                                  {trade.openTime ? (
                                    <span className="text-xs text-muted-foreground">
                                      {format(parseISO(trade.openTime), 'HH:mm')}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  {trade.notes ? <FileText className="w-3 h-3 text-blue-500" /> : null}
                                  {trade.screenshots && trade.screenshots.length > 0 ? (
                                    <ImageIcon className="w-3 h-3 text-purple-500" />
                                  ) : null}
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-3">
                                <div>
                                  <div
                                    className={`font-semibold ${pnlTextClass(trade.pnl)}`}
                                  >
                                    {formatCurrency(trade.pnl)}
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </div>

              {/* Selected Trade (shows directly under Trades Taken) */}
              {selectedTradeDetail ? (
                <div ref={selectedTradeSectionRef}>
                  <Card className="p-4 bg-card/50 border-muted space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base">Selected Trade</h3>
                        <Badge
                          variant="outline"
                          className={
                            selectedTradeDetail.type === 'long'
                              ? semanticColors.longChipClasses
                              : semanticColors.shortChipClasses
                          }
                        >
                          {selectedTradeDetail.type.toUpperCase()}
                        </Badge>
                        <span className="text-sm font-medium">{selectedTradeDetail.symbol}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedTradeDetail.openTime ? format(parseISO(selectedTradeDetail.openTime), 'MMM d, HH:mm') : selectedTradeDetail.date}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTradeId(null);
                        setSelectedTradeDetail(null);
                        setTradeNotes('');
                        setTradeNotesDirty(false);
                        setTradeMeta({});
                        setTradeEmotionsText('');
                        setTradeMistakesText('');
                        setTradeShotError(null);
                      }}
                    >
                      Clear
                    </Button>
                  </div>

                  {/* A) Trade Notes */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sm">Trade Notes</h4>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveTradeNotes({ source: 'manual' })}
                        disabled={savingTradeNotes}
                        className="gap-2"
                      >
                        <Save className="w-3 h-3" />
                        {savingTradeNotes ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                    <Textarea
                      value={tradeNotes}
                      onChange={(e) => {
                        setTradeNotes(e.target.value);
                        setTradeNotesDirty(true);
                      }}
                      placeholder="Why did I take this trade? What was the plan?"
                      className="min-h-[140px] resize-y font-mono text-sm bg-background/50"
                    />
                    {selectedTradeDetail.note ? (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Autosaves after you pause typing.
                      </p>
                    ) : null}
                  </div>

                  {/* B) Screenshots (always visible) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sm">Screenshots</h4>
                      <label>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handleTradeScreenshotUpload}
                          disabled={uploadingTradeShot}
                        />
                        <Button size="sm" className="gap-2" disabled={uploadingTradeShot} asChild>
                          <span>
                            <Upload className="w-3 h-3" />
                            {uploadingTradeShot ? 'Uploading...' : 'Upload'}
                          </span>
                        </Button>
                      </label>
                    </div>
                    {tradeShotError ? (
                      <div className="text-xs text-destructive mb-2">
                        {tradeShotError} (bucket: {TRADE_SCREENSHOTS_BUCKET})
                      </div>
                    ) : null}
                    <ScreenshotGallery
                      media={selectedTradeDetail.screenshots}
                      onDelete={handleTradeScreenshotDelete}
                    />
                  </div>

                  {/* C) Emotions */}
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Emotions</h4>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {TRADE_EMOTIONS.map((label) => {
                        const active = (tradeMeta.emotions || []).includes(label);
                        return (
                          <Button
                            key={label}
                            type="button"
                            size="sm"
                            variant={active ? 'default' : 'outline'}
                            onClick={() => {
                              const prev = tradeMeta.emotions || [];
                              const next = prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label];
                              setTradeMeta((m) => ({ ...m, emotions: next }));
                              setTradeNotesDirty(true);
                            }}
                          >
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                    <Textarea
                      value={tradeEmotionsText}
                      onChange={(e) => {
                        setTradeEmotionsText(e.target.value);
                        setTradeNotesDirty(true);
                      }}
                      placeholder="Optional…"
                      className="min-h-[100px] resize-y font-mono text-sm bg-background/50"
                    />
                  </div>

                  {/* D) Mistakes */}
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Mistakes</h4>
                    <div className="space-y-2 mb-3">
                      {TRADE_MISTAKES.map((label) => {
                        const checked = (tradeMeta.mistakes || []).includes(label);
                        return (
                          <label key={label} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const prev = tradeMeta.mistakes || [];
                                const next = e.target.checked
                                  ? prev.includes(label)
                                    ? prev
                                    : [...prev, label]
                                  : prev.filter((x) => x !== label);
                                setTradeMeta((m) => ({ ...m, mistakes: next }));
                                setTradeNotesDirty(true);
                              }}
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                    <Textarea
                      value={tradeMistakesText}
                      onChange={(e) => {
                        setTradeMistakesText(e.target.value);
                        setTradeNotesDirty(true);
                      }}
                      placeholder="Optional…"
                      className="min-h-[100px] resize-y font-mono text-sm bg-background/50"
                    />
                  </div>
                  </Card>
                </div>
              ) : null}

              {/* 3) Day Notes (small card) */}
              <Card className="p-4 bg-card/50 border-muted">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4" />
                    Day Notes
                  </h3>
                  <Button
                    size="sm"
                    onClick={handleSaveJournal}
                    disabled={savingJournal}
                    className="gap-2"
                  >
                    <Save className="w-3 h-3" />
                    {savingJournal ? 'Saving...' : 'Save'}
                  </Button>
                </div>
                <Textarea
                  value={dayNotes}
                  onChange={(e) => setDayNotes(e.target.value)}
                  placeholder="Quick notes…"
                  className="min-h-[120px] max-h-[160px] resize-y font-mono text-sm bg-background/50"
                />
              </Card>

              {/* 4) News (small card) */}
              <div>
                <h3 className="font-semibold mb-3 text-sm">News</h3>
                <DayNewsBlock news={news} />
              </div>

              {/* 5) Day Insights (premium grid) */}
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-semibold text-sm">Day Insights</h3>
                  {hasActiveFilters ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedSession(null);
                        setSelectedMistake(null);
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : null}
                </div>
                {trades.length === 0 ? (
                  <Card className="p-6 text-center text-muted-foreground">
                    <p>No trades yet for insights.</p>
                  </Card>
                ) : (
                  <Card className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">Total P/L</div>
                        <div className={`font-semibold ${pnlTextClass(metrics.totalPnl)}`}>
                          {formatCurrency(metrics.totalPnl)}
                        </div>
                      </div>

                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">Trades</div>
                        <div className="font-semibold">{metrics.tradeCount}</div>
                      </div>

                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">Win rate</div>
                        <div className="font-semibold">{metrics.winRate.toFixed(0)}%</div>
                      </div>

                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">Avg R:R</div>
                        <div className="font-semibold">{metrics.avgRR > 0 ? metrics.avgRR.toFixed(2) : '—'}</div>
                      </div>

                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">Biggest win</div>
                        <div className="font-semibold">
                          {dayInsights.biggestWin ? formatCurrency(dayInsights.biggestWin.pnl) : '—'}
                        </div>
                      </div>

                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">Biggest loss</div>
                        <div className="font-semibold">
                          {dayInsights.biggestLoss ? formatCurrency(dayInsights.biggestLoss.pnl) : '—'}
                        </div>
                      </div>

                      {dayInsights.netR !== null ? (
                        <div className="rounded-lg border bg-muted/20 p-3 sm:col-span-2">
                          <div className="text-xs text-muted-foreground">Net R</div>
                          <div className="font-semibold">{dayInsights.netR.toFixed(2)}R</div>
                        </div>
                      ) : null}

                      {dayInsights.topTags.length ? (
                        <div className="rounded-lg border bg-muted/20 p-3 sm:col-span-2">
                          <div className="text-xs text-muted-foreground mb-2">Top tags / strategy</div>
                          <div className="flex flex-wrap gap-2">
                            {dayInsights.topTags.map((t) => (
                              <Badge key={t.label} variant="outline" className="text-xs">
                                {t.label} ({t.count})
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Sessions */}
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm font-semibold">Sessions</div>
                          <div className="text-xs text-muted-foreground">Tap a session to filter trades</div>
                        </div>
                        {selectedSession ? (
                          <Badge variant="outline" className="text-xs">Session: {sessionInsights.stats.find((s) => s.key === selectedSession)?.label}</Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sessionInsights.stats.map((s) => {
                          const active = selectedSession === s.key;
                          return (
                            <button
                              key={s.key}
                              type="button"
                              className={`min-w-[160px] flex-1 rounded-lg border p-3 text-left bg-muted/20 hover:bg-muted/30 transition-colors ${
                                active ? 'ring-2 ring-primary/40' : ''
                              }`}
                              onClick={() => setSelectedSession((prev) => (prev === s.key ? null : s.key))}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-semibold text-sm">{s.label}</div>
                                <Badge variant="outline" className="text-[11px]">{s.tradesCount}</Badge>
                              </div>
                              <div className={`mt-1 font-semibold tabular-nums ${pnlTextClass(s.totalPnl)}`}>
                                {s.totalPnl > 0 ? '+' : ''}{formatCurrency(s.totalPnl)}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                                WR {typeof s.winRate === 'number' ? `${s.winRate.toFixed(0)}%` : '—'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Mistakes */}
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm font-semibold">Mistakes</div>
                          <div className="text-xs text-muted-foreground">Tap a mistake to filter trades</div>
                        </div>
                        {selectedMistake ? (
                          <Badge variant="outline" className="text-xs">Mistake: {selectedMistake}</Badge>
                        ) : null}
                      </div>

                      {mistakeInsights.uniqueMistakesCount === 0 ? (
                        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                          Add mistakes to trade notes (e.g. “Mistake: Overtraded” or #mistake_fomo) to see insights.
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2 mb-3">
                            <Badge variant="outline" className="text-xs">
                              Trades w/ mistakes: {mistakeInsights.tradesWithAnyMistake} / {trades.length}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              Mistake rate: {typeof mistakeInsights.mistakeRate === 'number' ? `${mistakeInsights.mistakeRate.toFixed(0)}%` : '—'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              Unique mistakes: {mistakeInsights.uniqueMistakesCount}
                            </Badge>
                          </div>

                          <div className="space-y-2">
                            {mistakeInsights.topMistakes.map((m) => {
                              const active = selectedMistake === m.label;
                              return (
                                <button
                                  key={m.label}
                                  type="button"
                                  className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left bg-muted/20 hover:bg-muted/30 transition-colors ${
                                    active ? 'ring-2 ring-primary/40' : ''
                                  }`}
                                  onClick={() => setSelectedMistake((prev) => (prev === m.label ? null : m.label))}
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">{m.label}</div>
                                  </div>
                                  <Badge variant="outline" className="text-[11px]">{m.count}</Badge>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
