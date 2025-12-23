import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { X, Save, Plus, TrendingUp, TrendingDown, FileText, Image as ImageIcon, ChevronRight } from 'lucide-react';
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
} from '../utils/day-journal-api';
import { formatCurrency } from '../utils/trade-calculations';
import { TradeDetailPanel } from './trade-detail-panel';
import { DayNewsBlock } from './day-news-block';
import { TradingViewChart } from './trading-view-chart';
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
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [selectedTradeDetail, setSelectedTradeDetail] = useState<TradeWithDetails | null>(null);

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
      setJournalNotes(dayJournal?.notes || '');
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
    }
  }, [open, selectedDay, loadDayData]);

  const handleSaveJournal = async () => {
    if (!selectedDay) return;

    setSavingJournal(true);
    try {
      const success = await upsertDayJournal(selectedDay, journalNotes);
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
    
    try {
      const detail = await getTradeDetail(trade.id);
      setSelectedTradeDetail(detail);
    } catch (error) {
      console.error('Failed to load trade detail', error);
      toast.error('Failed to load trade details');
    }
  };

  const handleTradeDetailClose = () => {
    setSelectedTrade(null);
    setSelectedTradeDetail(null);
  };

  const handleTradeUpdated = async () => {
    await loadDayData();
    if (selectedTrade) {
      const detail = await getTradeDetail(selectedTrade.id);
      setSelectedTradeDetail(detail);
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
            <div className="p-6 space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : selectedTrade && selectedTradeDetail ? (
            <TradeDetailPanel
              trade={selectedTradeDetail}
              onClose={handleTradeDetailClose}
              onTradeUpdated={handleTradeUpdated}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 p-4">
              {/* Main column */}
              <div className="space-y-4">
                {/* Big Chart */}
                <div>
                  <h3 className="font-semibold mb-3 text-sm">Chart</h3>
                  <TradingViewChart
                    symbol={trades.length > 0 ? trades[0].symbol : 'XAUUSD'}
                    heightClassName="h-[380px] lg:h-[420px]"
                  />
                </div>

                {/* Trades Taken */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Trades Taken
                  </h3>
                  {trades.length === 0 ? (
                    <Card className="p-8 text-center text-muted-foreground">
                      <p>No trades on this day</p>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {trades.map((trade) => (
                        <Card
                          key={trade.id}
                          className="p-4 hover:bg-accent cursor-pointer transition-colors"
                          onClick={() => handleTradeClick(trade)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold">{trade.symbol}</span>
                                <Badge
                                  variant={trade.type === 'long' ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  {trade.type.toUpperCase()}
                                </Badge>
                                {trade.setup && (
                                  <Badge variant="outline" className="text-xs">
                                    {trade.setup}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>
                                  {trade.openTime
                                    ? format(parseISO(trade.openTime), 'HH:mm')
                                    : '—'}
                                </span>
                                <span>Entry: {trade.entry}</span>
                                <span>Exit: {trade.exit}</span>
                                {trade.notes && <FileText className="w-3 h-3 text-blue-500" />}
                                {trade.screenshots && trade.screenshots.length > 0 && (
                                  <ImageIcon className="w-3 h-3 text-purple-500" />
                                )}
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
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Notes (compact) */}
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
                    value={journalNotes}
                    onChange={(e) => setJournalNotes(e.target.value)}
                    placeholder="Quick notes…"
                    className="min-h-[120px] resize-y font-mono text-sm bg-background/50"
                  />
                </Card>

                {/* News */}
                <div>
                  <h3 className="font-semibold mb-3 text-sm">News</h3>
                  <DayNewsBlock news={news} />
                </div>

                {/* Day Insights */}
                <div>
                  <h3 className="font-semibold mb-3 text-sm">Day Insights</h3>
                  <Card className="p-3 space-y-2 text-xs">
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
                        {metrics.tradeCount > 5 && (
                          <div className="pt-2 border-t text-amber-600">
                            ⚠️ Overtrading warning: {metrics.tradeCount} trades
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground text-center py-4">
                        No trades to analyze
                      </p>
                    )}
                  </Card>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
