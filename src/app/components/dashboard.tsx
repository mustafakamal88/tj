import { useMemo, useState, useEffect, useRef } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Plus, ChevronLeft, ChevronRight, DollarSign, Percent, TrendingUp, TrendingDown, Upload, Link } from 'lucide-react';
import { fetchTradesCount, fetchTradesForCalendarMonth } from '../utils/trades-api';
import { calculateWinRate, calculateTotalPnL, formatCurrency } from '../utils/trade-calculations';
import { filterTradesForFreeUser } from '../utils/data-limit';
import { requestUpgrade } from '../utils/feature-access';
import { useProfile } from '../utils/use-profile';
import { getEffectivePlan, hasPaidEntitlement } from '../utils/entitlements';
import { getSupabaseClient } from '../utils/supabase';
import { toast } from 'sonner';
import type { Trade } from '../types/trade';
import { pnlBgSoftClass, pnlTextClass, semanticColors } from '../utils/semantic-colors';
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
import { DayViewDrawer } from './day-view-drawer';

type CalendarDayData = {
  count: number;
  pnl: number;
  isClosed: boolean;
} | null;

type CalendarWeekData = {
  pnl: number;
  days: number;
};

type DashboardCalendarCardProps = {
  currentMonth: Date;
  weeks: Date[][];
  getDayData: (day: Date) => CalendarDayData;
  getWeekData: (week: Date[]) => CalendarWeekData;
  isToday: (day: Date) => boolean;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onDayClick?: (day: Date) => void;
  preview?: boolean;
};

export function DashboardCalendarCard({
  currentMonth,
  weeks,
  getDayData,
  getWeekData,
  isToday,
  onPrevMonth,
  onNextMonth,
  onDayClick,
  preview = false,
}: DashboardCalendarCardProps) {
  return (
    <Card className="p-4 sm:p-6">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">TODAY</span>
          <span className="text-muted-foreground">-</span>
          <h2>{format(currentMonth, 'MMMM yyyy')}</h2>
        </div>
        {!preview && (
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={onPrevMonth} disabled={!onPrevMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={onNextMonth} disabled={!onNextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Calendar Grid */}
      <div
        className={
          preview
            ? 'overflow-hidden overflow-y-hidden'
            : 'overflow-x-auto overflow-y-hidden -mx-4 px-4 sm:mx-0 sm:px-0'
        }
      >
        <div className={preview ? 'flex justify-end' : ''}>
          <div className="w-full min-w-[800px]">
            {/* Day Headers */}
            <div className="grid grid-cols-8 gap-0 mb-2 [grid-template-columns:repeat(7,minmax(0,1fr))_120px]">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Week'].map((day) => (
                <div key={day} className="text-center text-[10px] sm:text-sm text-muted-foreground py-1.5 sm:py-2">
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
                    className="grid grid-cols-8 gap-0 [grid-template-columns:repeat(7,minmax(0,1fr))_120px]"
                  >
                    {/* Day Cells */}
                    {week.map((day, dayIndex) => {
                      const dayData = getDayData(day);
                      const isEmpty = day.getTime() === 0;
                      const isClickable = !preview && !isEmpty && onDayClick;
                      const interactive = isClickable ? 'hover:bg-accent cursor-pointer' : '';

                      const handleDayClick = () => {
                        if (isClickable) {
                          onDayClick(day);
                        }
                      };

                      const handleKeyDown = (e: React.KeyboardEvent) => {
                        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          onDayClick(day);
                        }
                      };

                      return (
                        <button
                          key={dayIndex}
                          onClick={handleDayClick}
                          onKeyDown={handleKeyDown}
                          disabled={!isClickable}
                          className={`
                            border-b border-r p-1 sm:p-4 aspect-square sm:aspect-auto sm:min-h-[100px] flex flex-col min-w-0 overflow-hidden
                            ${isEmpty ? 'bg-muted/20' : ''}
                            ${!isEmpty && dayData && !dayData.isClosed && !isToday(day) ? pnlBgSoftClass(dayData.pnl) : ''}
                            ${isToday(day) ? 'bg-blue-50 dark:bg-blue-950/20' : ''}
                            ${interactive}
                            ${isClickable ? 'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset' : ''}
                            disabled:cursor-default
                          `}
                        >
                          {!isEmpty && (
                            <>
                              {/* Date */}
                              <div className="text-[10px] sm:text-sm text-muted-foreground mb-1 sm:mb-2 leading-none">
                                {format(day, 'd')}
                              </div>

                              {/* P&L */}
                              <div className="flex-1 min-h-0 flex items-center justify-center">
                                {dayData?.isClosed ? (
                                  <span className="text-sm sm:text-2xl text-muted-foreground leading-none">—</span>
                                ) : (
                                  <span
                                    className={`block w-full text-center whitespace-nowrap text-[11px] sm:text-xl font-medium tabular-nums leading-tight ${pnlTextClass(dayData?.pnl)}`}
                                  >
                                    {dayData && formatCurrency(dayData.pnl).replace('.00', '')}
                                  </span>
                                )}
                              </div>

                              {/* Trade Count */}
                              <div className="w-full truncate whitespace-nowrap text-[10px] sm:text-xs text-center text-muted-foreground mt-1 sm:mt-2 leading-tight">
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
                        </button>
                      );
                    })}

                    {/* Week Summary Cell */}
                    <div className="border-b p-2 sm:p-4 min-h-0 sm:min-h-[100px] flex flex-col items-center justify-center bg-muted/30 min-w-0 overflow-hidden">
                      <div className="text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-2 leading-none">
                        Week {weekIndex + 1}
                      </div>
                      {weekData.days > 0 ? (
                        <>
                          <div
                            className={`text-sm sm:text-xl font-medium tabular-nums whitespace-nowrap ${pnlTextClass(weekData.pnl)}`}
                          >
                            {formatCurrency(weekData.pnl).replace('.00', '')}
                          </div>
                          <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2 leading-tight whitespace-nowrap">
                            {weekData.days} {weekData.days === 1 ? 'day' : 'days'}
                          </div>
                        </>
                      ) : (
                        <span className="text-sm sm:text-xl text-muted-foreground leading-none">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {!preview && (
        <>
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
        </>
      )}
    </Card>
  );
}

export function Dashboard() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalTradeCount, setTotalTradeCount] = useState(0);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isBrokerDialogOpen, setIsBrokerDialogOpen] = useState(false);
  const [isDayViewOpen, setIsDayViewOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const { profile, loading: profileLoading, refresh: refreshProfile } = useProfile();
  const effectivePlan = getEffectivePlan(profile);
  const paidActiveRef = useRef(false);
  const handledReturnRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    paidActiveRef.current = hasPaidEntitlement(profile);
  }, [profile]);

  // Handle URL query params for day view
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dayParam = params.get('day');
    if (dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
      setSelectedDay(dayParam);
      setIsDayViewOpen(true);
    }
  }, []);

  const handleDayClick = (day: Date) => {
    const dayString = format(day, 'yyyy-MM-dd');
    setSelectedDay(dayString);
    setIsDayViewOpen(true);

    // Update URL with query param
    const url = new URL(window.location.href);
    url.searchParams.set('day', dayString);
    window.history.pushState({}, '', url.toString());
  };

  const handleDayViewClose = (open: boolean) => {
    setIsDayViewOpen(open);
    if (!open) {
      setSelectedDay(null);
      
      // Remove query param from URL
      const url = new URL(window.location.href);
      url.searchParams.delete('day');
      window.history.pushState({}, '', url.toString());
    }
  };

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
              disabled={profileLoading || !profile}
              onClick={() => void (async () => {
                if (profileLoading) return;
                const latest = await refreshProfile();
                const entitlementProfile = latest ?? profile;
                if (!entitlementProfile) return;
                if (!hasPaidEntitlement(entitlementProfile)) {
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
              disabled={profileLoading || !profile}
              onClick={() => void (async () => {
                if (profileLoading) return;
                const latest = await refreshProfile();
                const entitlementProfile = latest ?? profile;
                if (!entitlementProfile) return;
                if (!hasPaidEntitlement(entitlementProfile)) {
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
            <div className={`text-2xl ${pnlTextClass(totalPnL)}`}>
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
              <span className={semanticColors.profitText}>{wins}</span>
              <span className="text-muted-foreground"> / </span>
              <span className={semanticColors.lossText}>{losses}</span>
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
        <DashboardCalendarCard
          currentMonth={currentMonth}
          weeks={weeks}
          getDayData={getDayData}
          getWeekData={getWeekData}
          isToday={isToday}
          onPrevMonth={() => setCurrentMonth(subMonths(currentMonth, 1))}
          onNextMonth={() => setCurrentMonth(addMonths(currentMonth, 1))}
          onDayClick={handleDayClick}
        />

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

      <DayViewDrawer
        open={isDayViewOpen}
        onOpenChange={handleDayViewClose}
        selectedDay={selectedDay}
      />
    </div>
  );
}
