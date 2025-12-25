import { useEffect, useMemo, useRef, useState } from 'react';
import type { Trade } from '../types/trade';
import { fetchTradesForCalendarMonth } from '../utils/trades-api';
import { filterTradesForFreeUser } from '../utils/data-limit';
import { useProfile } from '../utils/use-profile';
import { getEffectivePlan } from '../utils/entitlements';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { DayViewDrawer } from '../components/day-view-drawer';
import { DashboardCalendarCard } from '../components/calendar/dashboard-calendar-card';

type CalendarDayData = {
  count: number;
  pnl: number;
  isClosed: boolean;
} | null;

type CalendarWeekData = {
  pnl: number;
  days: number;
};

export function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isDayViewOpen, setIsDayViewOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { profile } = useProfile();
  const effectivePlan = getEffectivePlan(profile);
  const handledInitialDayParam = useRef(false);

  const handleDayClick = (day: Date) => {
    const dayString = format(day, 'yyyy-MM-dd');
    setSelectedDay(dayString);
    setIsDayViewOpen(true);

    const url = new URL(window.location.href);
    url.searchParams.set('day', dayString);
    window.history.pushState({}, '', url.toString());
  };

  const handleDayViewClose = (open: boolean) => {
    setIsDayViewOpen(open);
    if (!open) {
      setSelectedDay(null);
      const url = new URL(window.location.href);
      url.searchParams.delete('day');
      window.history.pushState({}, '', url.toString());
    }
  };

  useEffect(() => {
    if (handledInitialDayParam.current) return;
    handledInitialDayParam.current = true;

    const params = new URLSearchParams(window.location.search);
    const dayParam = params.get('day');
    if (dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
      setSelectedDay(dayParam);
      setIsDayViewOpen(true);

      const parsed = parseISO(dayParam);
      if (Number.isFinite(parsed.getTime())) {
        setCurrentMonth(parsed);
      }
    }
  }, []);

  const refreshTrades = async () => {
    const start = startOfMonth(currentMonth);
    const end = startOfMonth(addMonths(currentMonth, 1));
    const allTrades = await fetchTradesForCalendarMonth(start, end);
    const filteredTrades = effectivePlan === 'free' ? filterTradesForFreeUser(allTrades) : allTrades;
    setTrades(filteredTrades);
  };

  useEffect(() => {
    void refreshTrades();
  }, [effectivePlan, currentMonth]);

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);
  const monthDays = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

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
        while (currentWeekDays.length < 7) currentWeekDays.push(new Date(0));
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

  const getDayData = (day: Date): CalendarDayData => {
    if (day.getTime() === 0) return null;

    const key = format(day, 'yyyy-MM-dd');
    const stat = dayStats.get(key);

    return {
      count: stat?.count ?? 0,
      pnl: stat?.pnl ?? 0,
      isClosed: !stat,
    };
  };

  const getWeekData = (week: Date[]): CalendarWeekData => {
    const validDays = week.filter((d) => d.getTime() !== 0);
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
      days: tradingDays,
    };
  };

  const isToday = (day: Date) => {
    if (day.getTime() === 0) return false;
    return isSameDay(day, new Date());
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl mb-2">Calendar</h1>
            <p className="text-muted-foreground">Daily P/L and trade count</p>
          </div>
        </div>
        <DashboardCalendarCard
          currentMonth={currentMonth}
          weeks={weeks}
          getDayData={getDayData}
          getWeekData={getWeekData}
          isToday={isToday}
          onPrevMonth={() => setCurrentMonth(subMonths(currentMonth, 1))}
          onNextMonth={() => setCurrentMonth(addMonths(currentMonth, 1))}
          onDayClick={handleDayClick}
          onGoToDate={(day: Date) => {
            setCurrentMonth(day);
            handleDayClick(day);
          }}
          hideWeekends
        />
      </div>

      <DayViewDrawer open={isDayViewOpen} onOpenChange={handleDayViewClose} selectedDay={selectedDay} />
    </div>
  );
}
