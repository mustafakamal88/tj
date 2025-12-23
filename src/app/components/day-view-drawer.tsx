import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { X, Save, TrendingUp, FileText, Image as ImageIcon, ChevronRight, Upload } from 'lucide-react';
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
  addTradeScreenshot,
  deleteTradeScreenshot,
  TRADE_SCREENSHOTS_BUCKET,
  upsertTradeNotes,
} from '../utils/day-journal-api';
import { formatCurrency } from '../utils/trade-calculations';
import { DayNewsBlock } from './day-news-block';
import { TradingViewChart } from './trading-view-chart';
import { ScreenshotGallery } from './screenshot-gallery';
import { toast } from 'sonner';

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
  const [emotionsSelected, setEmotionsSelected] = useState<string[]>([]);
  const [emotionsFreeText, setEmotionsFreeText] = useState('');
  const [mistakesSelected, setMistakesSelected] = useState<string[]>([]);
  const [mistakesFreeText, setMistakesFreeText] = useState('');
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [selectedTradeDetail, setSelectedTradeDetail] = useState<TradeWithDetails | null>(null);
  const [savingTradeNotes, setSavingTradeNotes] = useState(false);
  const [tradeNotes, setTradeNotes] = useState('');
  const [uploadingTradeShot, setUploadingTradeShot] = useState(false);
  const [tradeShotError, setTradeShotError] = useState<string | null>(null);
  const tradeNotesDebounceRef = useRef<number | null>(null);

  const EMOTIONS = ['Calm', 'Fear', 'FOMO', 'Revenge', 'Overconfident'] as const;
  const MISTAKES = ['Entered early', 'No SL', 'Overleveraged', "Didn’t follow plan", 'Overtraded'] as const;

  function splitDayJournal(raw: string): {
    dayNotes: string;
    emotionsSelected: string[];
    emotionsFreeText: string;
    mistakesSelected: string[];
    mistakesFreeText: string;
  } {
    const text = raw || '';

    const emotionsMatch = text.match(/\n## Emotions\n([\s\S]*?)(?=\n## Mistakes\n|$)/);
    const mistakesMatch = text.match(/\n## Mistakes\n([\s\S]*?)$/);

    const emotionsBlock = emotionsMatch ? emotionsMatch[1] : '';
    const mistakesBlock = mistakesMatch ? mistakesMatch[1] : '';

    const cleanMain = text
      .replace(/\n## Emotions\n[\s\S]*?(?=\n## Mistakes\n|$)/, '')
      .replace(/\n## Mistakes\n[\s\S]*$/, '')
      .trim();

    const parseChipLine = (block: string) => {
      const line = block.split('\n').find((l) => l.toLowerCase().startsWith('- chips:'));
      if (!line) return [];
      const rawList = line.split(':').slice(1).join(':').trim();
      return rawList
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    };

    const parseFree = (block: string) => {
      const idx = block.toLowerCase().indexOf('- free:');
      if (idx === -1) return '';
      return block
        .slice(idx)
        .split(':')
        .slice(1)
        .join(':')
        .trim();
    };

    const parseChecklist = (block: string) => {
      const selected: string[] = [];
      for (const line of block.split('\n')) {
        const m = line.match(/^- \[x\] (.+)$/i);
        if (m?.[1]) selected.push(m[1].trim());
      }
      return selected;
    };

    return {
      dayNotes: cleanMain,
      emotionsSelected: parseChipLine(emotionsBlock),
      emotionsFreeText: parseFree(emotionsBlock),
      mistakesSelected: parseChecklist(mistakesBlock),
      mistakesFreeText: parseFree(mistakesBlock),
    };
  }

  function composeDayJournal(input: {
    dayNotes: string;
    emotionsSelected: string[];
    emotionsFreeText: string;
    mistakesSelected: string[];
    mistakesFreeText: string;
  }): string {
    const base = (input.dayNotes || '').trim();
    const emotionsLine = input.emotionsSelected.length ? `- chips: ${input.emotionsSelected.join(', ')}` : '- chips:';
    const emotionsFree = `- free: ${(input.emotionsFreeText || '').trim()}`;
    const mistakesLines = input.mistakesSelected.length
      ? input.mistakesSelected.map((m) => `- [x] ${m}`).join('\n')
      : '- [ ]';
    const mistakesFree = `- free: ${(input.mistakesFreeText || '').trim()}`;

    return [
      base,
      '## Emotions',
      emotionsLine,
      emotionsFree,
      '## Mistakes',
      mistakesLines,
      mistakesFree,
    ]
      .filter((s) => typeof s === 'string')
      .join('\n')
      .trim();
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
      const parsed = splitDayJournal(rawNotes);
      setDayNotes(parsed.dayNotes);
      setEmotionsSelected(parsed.emotionsSelected);
      setEmotionsFreeText(parsed.emotionsFreeText);
      setMistakesSelected(parsed.mistakesSelected);
      setMistakesFreeText(parsed.mistakesFreeText);
      setNews(dayNews);
    } catch (error) {
      console.error('Failed to load day data', error);
      toast.error('Failed to load day data');
    } finally {
      setLoading(false);
    }
  }, [selectedDay]);

  useEffect(() => {
    if (open && selectedDay) {
      loadDayData();
      setSelectedTrade(null);
      setSelectedTradeDetail(null);
      setTradeNotes('');
      setTradeShotError(null);
    }
  }, [open, selectedDay, loadDayData]);

  const handleSaveJournal = async () => {
    if (!selectedDay) return;

    setSavingJournal(true);
    try {
      const composed = composeDayJournal({
        dayNotes,
        emotionsSelected,
        emotionsFreeText,
        mistakesSelected,
        mistakesFreeText,
      });
      const success = await upsertDayJournal(selectedDay, composed);
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
    setSelectedTrade(trade);
    setTradeShotError(null);
    
    try {
      const detail = await getTradeDetail(trade.id);
      setSelectedTradeDetail(detail);
      setTradeNotes(detail?.note?.notes || '');
    } catch (error) {
      console.error('Failed to load trade detail', error);
      toast.error('Failed to load trade details');
    }
  };

  const handleTradeUpdated = async () => {
    await loadDayData();
    if (selectedTrade) {
      const detail = await getTradeDetail(selectedTrade.id);
      setSelectedTradeDetail(detail);
      setTradeNotes(detail?.note?.notes || tradeNotes);
    }
  };

  const selectedTradeId = selectedTrade?.id ?? null;

  const selectedTradeMetrics = useMemo(() => {
    if (!selectedTradeDetail) return null;
    const entry = selectedTradeDetail.entry;
    const exit = selectedTradeDetail.exit;
    const sl = typeof selectedTradeDetail.stopLoss === 'number' ? selectedTradeDetail.stopLoss : null;
    const tp = typeof selectedTradeDetail.takeProfit === 'number' ? selectedTradeDetail.takeProfit : null;
    const isLong = selectedTradeDetail.type === 'long';

    const risk = sl === null ? null : isLong ? entry - sl : sl - entry;
    const reward = tp === null ? null : isLong ? tp - entry : entry - tp;

    const riskOk = risk !== null && Number.isFinite(risk) && risk > 0;
    const rewardOk = reward !== null && Number.isFinite(reward) && reward > 0;
    const rr = riskOk && rewardOk ? reward! / risk! : null;

    return {
      entry,
      exit,
      sl,
      tp,
      rr: rr && Number.isFinite(rr) ? rr : null,
    };
  }, [selectedTradeDetail]);

  const handleSaveTradeNotes = async () => {
    if (!selectedTradeDetail) return;
    setSavingTradeNotes(true);
    try {
      const success = await upsertTradeNotes(selectedTradeDetail.id, tradeNotes);
      if (success) {
        toast.success('Trade notes saved');
        await handleTradeUpdated();
      } else {
        toast.error('Failed to save trade notes');
      }
    } catch (error) {
      console.error('Failed to save trade notes', error);
      toast.error('Failed to save trade notes');
    } finally {
      setSavingTradeNotes(false);
    }
  };

  // Autosave if a note already exists in DB.
  useEffect(() => {
    if (!selectedTradeDetail) return;
    if (!selectedTradeDetail.note) return;

    if (tradeNotesDebounceRef.current) {
      window.clearTimeout(tradeNotesDebounceRef.current);
    }

    tradeNotesDebounceRef.current = window.setTimeout(() => {
      void handleSaveTradeNotes();
    }, 800);

    return () => {
      if (tradeNotesDebounceRef.current) {
        window.clearTimeout(tradeNotesDebounceRef.current);
        tradeNotesDebounceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeNotes, selectedTradeDetail?.id]);

  const handleTradeScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedTradeDetail) return;

    setTradeShotError(null);
    setUploadingTradeShot(true);
    try {
      const results = await Promise.all(Array.from(files).map((f) => addTradeScreenshot(selectedTradeDetail.id, f)));
      const okCount = results.filter((r) => r.ok).length;
      if (okCount > 0) {
        toast.success(`Uploaded ${okCount} screenshot(s)`);
        await handleTradeUpdated();
      }

      const firstFailure = results.find((r) => !r.ok);
      if (firstFailure && !firstFailure.ok) {
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

            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="-mt-1"
              aria-label="Close day view"
            >
              <X className="w-5 h-5" />
            </Button>
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
              {/* 1) Chart */}
              <div className="pt-4">
                <h3 className="font-semibold mb-3 text-sm">Chart</h3>
                <TradingViewChart
                  symbol={selectedTradeDetail?.symbol || (trades.length > 0 ? trades[0].symbol : 'XAUUSD')}
                  heightClassName="h-[340px] sm:h-[380px] lg:h-[420px]"
                />
              </div>

              {/* 2) Trades Taken */}
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
                  <div className="space-y-2">
                    {trades.map((trade) => {
                      const isSelected = selectedTradeId === trade.id;
                      return (
                        <Card
                          key={trade.id}
                          className={`p-4 transition-colors cursor-pointer ${
                            isSelected ? 'ring-2 ring-primary bg-accent' : 'hover:bg-accent'
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
                                <div className="text-xs text-muted-foreground">
                                  {trade.pnlPercentage >= 0 ? '+' : ''}
                                  {trade.pnlPercentage.toFixed(2)}%
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3) Selected Trade Details */}
              {selectedTradeDetail ? (
                <Card className="p-4 bg-card/50 border-muted space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base">{selectedTradeDetail.symbol}</h3>
                        <Badge variant={selectedTradeDetail.type === 'long' ? 'default' : 'secondary'}>
                          {selectedTradeDetail.type.toUpperCase()}
                        </Badge>
                        {selectedTradeDetail.setup ? (
                          <Badge variant="outline" className="text-xs">
                            {selectedTradeDetail.setup}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedTradeDetail.openTime ? format(parseISO(selectedTradeDetail.openTime), 'MMM d, HH:mm') : selectedTradeDetail.date}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedTradeDetail(null)}>
                      Clear
                    </Button>
                  </div>

                  {/* Levels */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Entry</div>
                      <div className="font-mono font-semibold">{selectedTradeMetrics?.entry}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Exit</div>
                      <div className="font-mono font-semibold">{selectedTradeMetrics?.exit}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">SL</div>
                      <div className="font-mono">{selectedTradeMetrics?.sl ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">TP</div>
                      <div className="font-mono">{selectedTradeMetrics?.tp ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">RR</div>
                      <div className="font-mono">{selectedTradeMetrics?.rr === null ? '—' : selectedTradeMetrics?.rr.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Market</div>
                      <div>{selectedTradeDetail.market ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Size</div>
                      <div>
                        {selectedTradeDetail.size && selectedTradeDetail.sizeUnit
                          ? `${selectedTradeDetail.size} ${selectedTradeDetail.sizeUnit}`
                          : selectedTradeDetail.quantity}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Account</div>
                      <div>{selectedTradeDetail.accountLogin ?? '—'}</div>
                    </div>
                  </div>

                  {/* Trade Notes */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sm">Trade Notes</h4>
                      <Button size="sm" onClick={handleSaveTradeNotes} disabled={savingTradeNotes} className="gap-2">
                        <Save className="w-3 h-3" />
                        {savingTradeNotes ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                    <Textarea
                      value={tradeNotes}
                      onChange={(e) => setTradeNotes(e.target.value)}
                      placeholder="Why did I take this trade? What was the plan?"
                      className="min-h-[140px] resize-y font-mono text-sm bg-background/50"
                    />
                    {selectedTradeDetail.note ? (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Autosaves after you pause typing.
                      </p>
                    ) : null}
                  </div>

                  {/* Trade Screenshots */}
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
                </Card>
              ) : null}

              {/* 4) Day Notes */}
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
                  className="min-h-[120px] resize-y font-mono text-sm bg-background/50"
                />
              </Card>

              {/* 5) Emotions & Mistakes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="p-4 bg-card/50 border-muted">
                  <h3 className="font-semibold text-sm mb-3">Emotions</h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {EMOTIONS.map((label) => {
                      const active = emotionsSelected.includes(label);
                      return (
                        <Button
                          key={label}
                          type="button"
                          size="sm"
                          variant={active ? 'default' : 'outline'}
                          onClick={() => {
                            setEmotionsSelected((prev) =>
                              prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label],
                            );
                          }}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                  <Textarea
                    value={emotionsFreeText}
                    onChange={(e) => setEmotionsFreeText(e.target.value)}
                    placeholder="Free text…"
                    className="min-h-[120px] resize-y font-mono text-sm bg-background/50"
                  />
                </Card>

                <Card className="p-4 bg-card/50 border-muted">
                  <h3 className="font-semibold text-sm mb-3">Mistakes</h3>
                  <div className="space-y-2 mb-3">
                    {MISTAKES.map((label) => {
                      const checked = mistakesSelected.includes(label);
                      return (
                        <label key={label} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const nextChecked = e.target.checked;
                              setMistakesSelected((prev) => {
                                if (nextChecked) return prev.includes(label) ? prev : [...prev, label];
                                return prev.filter((x) => x !== label);
                              });
                            }}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <Textarea
                    value={mistakesFreeText}
                    onChange={(e) => setMistakesFreeText(e.target.value)}
                    placeholder="Free text…"
                    className="min-h-[120px] resize-y font-mono text-sm bg-background/50"
                  />
                </Card>
              </div>

              {/* 6) News */}
              <div>
                <h3 className="font-semibold mb-3 text-sm">News</h3>
                <DayNewsBlock news={news} />
              </div>

              {/* 7) Day Insights */}
              <div>
                <h3 className="font-semibold mb-3 text-sm">Day Insights</h3>
                <Card className="p-4 bg-card/50 border-muted space-y-2 text-xs">
                  {metrics.tradeCount > 0 ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Biggest Win:</span>
                        <span className="text-green-600 font-medium">
                          {formatCurrency(metrics.biggestWin)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Biggest Loss:</span>
                        <span className="text-red-600 font-medium">
                          {formatCurrency(metrics.biggestLoss)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Win / Loss:</span>
                        <span>
                          <span className="text-green-600">{metrics.winCount}</span> /{' '}
                          <span className="text-red-600">{metrics.lossCount}</span>
                        </span>
                      </div>
                      {metrics.tradeCount > 5 ? (
                        <div className="pt-2 border-t text-amber-600">
                          ⚠️ Overtrading warning: {metrics.tradeCount} trades
                        </div>
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
