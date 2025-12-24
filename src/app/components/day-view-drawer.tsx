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
  const tradeNotesDebounceRef = useRef<number | null>(null);
  const selectedTradeSectionRef = useRef<HTMLDivElement | null>(null);
  const lastSavedTradeNoteSnapshotRef = useRef<string>('');

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

  const currentTradeNoteSnapshot = useMemo(() => {
    const normalizedExtraNotes = buildTradeNoteExtras({
      emotionsText: tradeEmotionsText,
      mistakesText: tradeMistakesText,
    });
    return JSON.stringify({
      notes: tradeNotes || '',
      meta: {
        emotions: tradeMeta.emotions || [],
        mistakes: tradeMeta.mistakes || [],
        extraNotes: normalizedExtraNotes,
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
      lastSavedTradeNoteSnapshotRef.current = JSON.stringify({
        notes: serverNotes,
        meta: {
          emotions: meta.emotions || [],
          mistakes: meta.mistakes || [],
          extraNotes: normalizedExtra,
        },
      });

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
      lastSavedTradeNoteSnapshotRef.current = JSON.stringify({
        notes: serverNotes,
        meta: {
          emotions: meta.emotions || [],
          mistakes: meta.mistakes || [],
          extraNotes: normalizedExtra,
        },
      });
    }
  };

  const handleSaveTradeNotes = async (opts?: { source?: 'manual' | 'autosave' }) => {
    if (!selectedTradeDetail) return;

    // Guard: never save if unchanged (prevents loops/toast spam).
    if (currentTradeNoteSnapshot === lastSavedTradeNoteSnapshotRef.current) {
      setTradeNotesDirty(false);
      return;
    }

    setSavingTradeNotes(true);
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
        lastSavedTradeNoteSnapshotRef.current = currentTradeNoteSnapshot;
        setTradeNotesDirty(false);
        await handleTradeUpdated();
      } else {
        if (opts?.source !== 'autosave') toast.error('Failed to save trade notes');
      }
    } catch (error) {
      console.error('Failed to save trade notes', error);
      if (opts?.source !== 'autosave') toast.error('Failed to save trade notes');
    } finally {
      setSavingTradeNotes(false);
    }
  };

  // Autosave only after user edits (never on initial render or trade selection).
  useEffect(() => {
    if (!selectedTradeDetail) return;
    if (!tradeNotesDirty) return;

    if (currentTradeNoteSnapshot === lastSavedTradeNoteSnapshotRef.current) {
      setTradeNotesDirty(false);
      return;
    }

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
  }, [currentTradeNoteSnapshot, selectedTradeDetail?.id, tradeNotesDirty]);

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
      if (firstFailure && !firstFailure.ok) {
        if (firstFailure.userMessage) {
          setTradeShotError(firstFailure.userMessage);
          toast.error(firstFailure.userMessage);
        } else 
        if (firstFailure.kind === 'bucket_missing') {
          setTradeShotError(`Storage bucket missing (${TRADE_SCREENSHOTS_BUCKET}).`);
          toast.error(`Storage bucket missing (${TRADE_SCREENSHOTS_BUCKET}).`);
        } else if (firstFailure.kind === 'storage_policy' || firstFailure.kind === 'db_policy') {
          setTradeShotError('Permission denied. Check Supabase storage/table policies.');
          toast.error('Permission denied uploading screenshots.');
        } else {
          setTradeShotError('Upload failed. See console for details.');
          toast.error('Screenshot upload failed.');
        }
        console.error('[DayViewDrawer] trade screenshot upload failed', firstFailure);
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

  if (!selectedDay) return null;

  const dayDate = parseISO(selectedDay);
  const dayTitle = format(dayDate, 'EEE, MMM d, yyyy');
  const metrics = calculateDayMetrics(trades);

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
                ) : (
                  <Card className="p-0 overflow-hidden">
                    <div className="divide-y divide-border">
                      {trades.map((trade) => {
                        const isSelected = selectedTradeId === trade.id;
                        return (
                          <button
                            key={trade.id}
                            type="button"
                            className={`w-full text-left p-4 transition-colors ${
                              isSelected ? 'bg-accent' : 'hover:bg-accent'
                            }`}
                            onClick={() => handleTradeClick(trade)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="font-semibold">{trade.symbol}</span>
                                  <Badge
                                    variant={trade.type === 'long' ? 'default' : 'secondary'}
                                    className="text-xs"
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
                                    className={`font-semibold ${
                                      trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                                    }`}
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

              {/* Day Insights */}
              <div>
                <h3 className="font-semibold mb-3 text-sm">Day Insights</h3>
                {trades.length === 0 ? (
                  <Card className="p-6 text-center text-muted-foreground">
                    <p>No trades yet for insights.</p>
                  </Card>
                ) : (
                  <Card className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">Total P/L</div>
                        <div className={metrics.totalPnl >= 0 ? 'text-foreground font-semibold' : 'text-destructive font-semibold'}>
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
                        <Badge variant={selectedTradeDetail.type === 'long' ? 'default' : 'secondary'}>
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

              {/* 5) Day Insights (small card) */}
              <div>
                <h3 className="font-semibold mb-3 text-sm">Day Insights</h3>
                <Card className="p-4 bg-card/50 border-muted space-y-2 text-xs">
                  {metrics.tradeCount > 0 ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Biggest Win:</span>
                        <span className="text-green-600 font-medium">{formatCurrency(metrics.biggestWin)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Biggest Loss:</span>
                        <span className="text-red-600 font-medium">{formatCurrency(metrics.biggestLoss)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Win / Loss:</span>
                        <span>
                          <span className="text-green-600">{metrics.winCount}</span> /{' '}
                          <span className="text-red-600">{metrics.lossCount}</span>
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Win Rate:</span>
                        <span>{metrics.winRate.toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg RR:</span>
                        <span>{metrics.avgRR.toFixed(2)}</span>
                      </div>
                      {metrics.tradeCount > 5 ? (
                        <div className="pt-2 border-t text-amber-600">⚠️ Overtrading warning: {metrics.tradeCount} trades</div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-muted-foreground text-center py-2">No trades to analyze</p>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
