import { useMemo, useState, useEffect, useRef } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Plus, ChevronLeft, ChevronRight, DollarSign, Percent, TrendingUp, TrendingDown, Upload, Link } from 'lucide-react';
import { fetchTradesCount, fetchTradesForCalendarMonth } from '../utils/trades-api';
import { calculateWinRate, calculateTotalPnL, formatCurrency } from '../utils/trade-calculations';
import { filterTradesForFreeUser } from '../utils/data-limit';
import { requestUpgrade } from '../utils/feature-access';
import { useProfile } from '../utils/use-profile';
import { getSupabaseClient } from '../utils/supabase';
import { toast } from 'sonner';
import type { Trade } from '../types/trade';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay,
  getDay,
  addMonths,
  subMonths
} from 'date-fns';
import { AddTradeDialog } from './add-trade-dialog';
import { MTImportDialog } from './mt-import-dialog';
import { BrokerConnectionDialog } from './broker-connection-dialog';

export function Dashboard() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalTradeCount, setTotalTradeCount] = useState(0);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isBrokerDialogOpen, setIsBrokerDialogOpen] = useState(false);
  const { plan, isActive, refresh: refreshProfile } = useProfile();
  const effectivePlan = isActive ? plan : 'free';
  const paidActiveRef = useRef(false);
  const handledReturnRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    paidActiveRef.current = isActive && (plan === 'pro' || plan === 'premium');
  }, [isActive, plan]);

  const refreshTrades = async () => {
    const start = startOfMonth(currentMonth);
    const end = startOfMonth(addMonths(currentMonth, 1));
    const allTrades = await fetchTradesForCalendarMonth(start, end);
    const filteredTrades = effectivePlan === 'free' ? filterTradesForFreeUser(allTrades) : allTrades;
    setTrades(filteredTrades);

    const count = await fetchTradesCount();
    setTotalTradeCount(count);
  };

  useEffect(() => {
    void refreshTrades();

    const handleSubscriptionChanged = () => {
      void refreshTrades();
    };

    window.addEventListener('subscription-changed', handleSubscriptionChanged);

    return () => {
      window.removeEventListener('subscription-changed', handleSubscriptionChanged);
    };
  }, [effectivePlan, currentMonth]);

  useEffect(() => {
    // Stripe redirects back to /dashboard; webhooks update Supabase asynchronously.
    // Poll profile refresh briefly until the paid plan becomes visible in the DB.
    if (handledReturnRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const portal = params.get('portal');
    if (checkout !== 'success' && portal !== '1') return;

    handledReturnRef.current = true;
    if (checkout === 'success') toast.success('Payment successful. Activating your plan…');
    if (portal === '1') toast.success('Welcome back. Syncing your subscription…');

    const clearQueryParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      url.searchParams.delete('portal');
      window.history.replaceState({}, '', url.toString());
    };

    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    let attempt = 0;

    const tick = async () => {
      try {
        await getSupabaseClient()?.auth.refreshSession();
      } catch {
        // ignore
      }

      await refreshProfile();

      if (paidActiveRef.current) {
        window.dispatchEvent(new Event('subscription-changed'));
        clearQueryParams();
        return;
      }

      attempt += 1;
      if (attempt >= 8) {
        clearQueryParams();
        return;
      }

      const delay = Math.min(8000, 1000 * Math.pow(2, attempt)); // 2s,4s,8s...
      pollTimerRef.current = window.setTimeout(() => void tick(), delay);
    };

    void tick();
  }, [refreshProfile]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, []);
  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);

  // Calculate statistics
  const totalPnL = useMemo(() => calculateTotalPnL(trades), [trades]);
  const winRate = useMemo(() => calculateWinRate(trades), [trades]);
  const totalTrades = trades.length;
  const wins = useMemo(() => trades.filter((t) => t.outcome === 'win').length, [trades]);
  const losses = useMemo(
    () => trades.filter((t) => t.outcome === 'loss').length,
    [trades],
  );

  const monthDays = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

  // Group days by week
  const weeks: Date[][] = useMemo(() => {
    const out: Date[][] = [];
    let currentWeekDays: Date[] = [];
    const firstDayOfWeek = getDay(monthStart);
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeekDays.push(new Date(0));
    }
    monthDays.forEach((day, index) => {
      currentWeekDays.push(day);
      if (getDay(day) === 6 || index === monthDays.length - 1) {
        out.push([...currentWeekDays]);
        currentWeekDays = [];
      }
    });
    return out;
  }, [monthDays, monthStart]);

  const dayStats = useMemo(() => {
    const map = new Map<string, { count: number; pnl: number }>();
    for (const trade of trades) {
      let key = trade.date;
      if (trade.closeTime) {
        const parsed = new Date(trade.closeTime);
        if (!Number.isNaN(parsed.getTime())) key = format(parsed, 'yyyy-MM-dd');
      } else if (trade.openTime) {
        const parsed = new Date(trade.openTime);
        if (!Number.isNaN(parsed.getTime())) key = format(parsed, 'yyyy-MM-dd');
      }
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.pnl += trade.pnl;
      } else {
        map.set(key, { count: 1, pnl: trade.pnl });
      }
    }
    return map;
  }, [trades]);

  // Calculate trade data for each day
  const getDayData = (day: Date) => {
    if (day.getTime() === 0) return null; // Empty cell
    
    const key = format(day, 'yyyy-MM-dd');
    const stat = dayStats.get(key);
    
    return {
      count: stat?.count ?? 0,
      pnl: stat?.pnl ?? 0,
      isClosed: !stat
    };
  };

  // Calculate weekly totals
  const getWeekData = (week: Date[]) => {
    const validDays = week.filter(d => d.getTime() !== 0);
    let totalWeekPnL = 0;
    let tradingDays = 0;
    for (const day of validDays) {
      const key = format(day, 'yyyy-MM-dd');
      const stat = dayStats.get(key);
      if (stat) {
        tradingDays += 1;
        totalWeekPnL += stat.pnl;
      }
    }
    
    return {
      pnl: totalWeekPnL,
      days: tradingDays
    };
  };

  const isToday = (day: Date) => {
    if (day.getTime() === 0) return false;
    return isSameDay(day, new Date());
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Track your trading performance</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void (async () => {
                const latest = await refreshProfile();
                const status = (latest?.subscriptionStatus ?? '').toLowerCase();
                const hasPaidAccess =
                  (latest?.subscriptionPlan === 'pro' || latest?.subscriptionPlan === 'premium') &&
                  (status === 'active' || status === 'trialing');
                if (!hasPaidAccess) {
                  requestUpgrade('broker_import');
                  return;
                }
                setIsBrokerDialogOpen(true);
              })()}
              className="gap-2"
            >
              <Link className="w-4 h-4" />
              Connect Broker
            </Button>
            <Button
              variant="outline"
              onClick={() => void (async () => {
                const latest = await refreshProfile();
                const status = (latest?.subscriptionStatus ?? '').toLowerCase();
                const hasPaidAccess =
                  (latest?.subscriptionPlan === 'pro' || latest?.subscriptionPlan === 'premium') &&
                  (status === 'active' || status === 'trialing');
                if (!hasPaidAccess) {
                  requestUpgrade('import');
                  return;
                }
                setIsImportDialogOpen(true);
              })()}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              Import
            </Button>
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Trade
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground">Total P&L (Month)</span>
              <DollarSign className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className={`text-2xl ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalPnL)}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground">Win Rate</span>
              <Percent className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-2xl">
              {winRate.toFixed(1)}%
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground">Wins / Losses</span>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-2xl">
              <span className="text-green-600">{wins}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-red-600">{losses}</span>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground">Total Trades</span>
              <TrendingDown className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-2xl">{totalTrades}</div>
          </Card>
        </div>

        {/* Calendar Card */}
        <Card className="p-6">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">TODAY</span>
              <span className="text-muted-foreground">-</span>
              <h2>{format(currentMonth, 'MMMM yyyy')}</h2>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Day Headers */}
              <div className="grid grid-cols-8 gap-0 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Week'].map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm text-muted-foreground py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Rows */}
              <div className="border rounded-lg overflow-hidden">
                {weeks.map((week, weekIndex) => {
                  const weekData = getWeekData(week);
                  return (
                    <div
                      key={weekIndex}
                      className="grid grid-cols-8 gap-0"
                      style={{ gridTemplateColumns: 'repeat(7, 1fr) 120px' }}
                    >
                      {/* Day Cells */}
                      {week.map((day, dayIndex) => {
                        const dayData = getDayData(day);
                        const isEmpty = day.getTime() === 0;
                        
                        return (
                          <div
                            key={dayIndex}
                            className={`
                              border-b border-r p-4 min-h-[100px] flex flex-col
                              ${isEmpty ? 'bg-muted/20' : ''}
                              ${isToday(day) ? 'bg-blue-50 dark:bg-blue-950/20' : ''}
                              ${dayData && !dayData.isClosed ? 'hover:bg-accent cursor-pointer' : ''}
                            `}
                          >
                            {!isEmpty && (
                              <>
                                {/* Date */}
                                <div className="text-sm text-muted-foreground mb-2">
                                  {format(day, 'd')}
                                </div>

                                {/* P&L */}
                                <div className="flex-1 flex items-center justify-center">
                                  {dayData?.isClosed ? (
                                    <span className="text-2xl text-muted-foreground">—</span>
                                  ) : (
                                    <span
                                      className={`text-xl font-medium ${
                                        dayData && dayData.pnl >= 0
                                          ? 'text-green-600'
                                          : 'text-red-600'
                                      }`}
                                    >
                                      {dayData && formatCurrency(dayData.pnl).replace('.00', '')}
                                    </span>
                                  )}
                                </div>

                                {/* Trade Count */}
                                <div className="text-xs text-center text-muted-foreground mt-2">
                                  {dayData?.isClosed ? (
                                    'Closed'
                                  ) : (
                                    <>
                                      {dayData?.count} {dayData?.count === 1 ? 'trade' : 'trades'}
                                    </>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}

                      {/* Week Summary Cell */}
                      <div className="border-b p-4 min-h-[100px] flex flex-col items-center justify-center bg-muted/30">
                        <div className="text-sm text-muted-foreground mb-2">
                          Week {weekIndex + 1}
                        </div>
                        {weekData.days > 0 ? (
                          <>
                            <div
                              className={`text-xl font-medium ${
                                weekData.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {formatCurrency(weekData.pnl).replace('.00', '')}
                            </div>
                            <div className="text-xs text-muted-foreground mt-2">
                              {weekData.days} {weekData.days === 1 ? 'day' : 'days'}
                            </div>
                          </>
                        ) : (
                          <span className="text-xl text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-600"></div>
              <span>Profit</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-600"></div>
              <span>Loss</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border-2"></div>
              <span>Closed</span>
            </div>
          </div>
        </Card>

        {/* Empty State */}
        {totalTradeCount === 0 && (
          <Card className="p-12 text-center mt-8">
            <p className="text-muted-foreground mb-4">No trades yet. Start tracking your performance!</p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Trade
            </Button>
          </Card>
        )}
      </div>

      <AddTradeDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onTradeAdded={refreshTrades}
      />

      <MTImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImportComplete={refreshTrades}
      />

      <BrokerConnectionDialog
        open={isBrokerDialogOpen}
        onOpenChange={setIsBrokerDialogOpen}
        onImportComplete={refreshTrades}
      />
    </div>
  );
}
