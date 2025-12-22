import { useMemo } from 'react';
import { eachDayOfInterval, endOfMonth, format, getDay, isSameDay, startOfMonth } from 'date-fns';
import { DashboardCalendarCard } from '../../app/components/dashboard';

type DayStat = {
  count: number;
  pnl: number;
};

const DEMO_MONTH = new Date(2025, 11, 1); // December 2025

const demoStats: Array<[string, DayStat]> = [
  ['2025-12-01', { count: 1, pnl: 120 }],
  ['2025-12-02', { count: 2, pnl: 85 }],
  ['2025-12-03', { count: 1, pnl: -60 }],
  ['2025-12-04', { count: 1, pnl: 140 }],
  ['2025-12-05', { count: 2, pnl: 90 }],

  ['2025-12-08', { count: 2, pnl: -220 }],
  ['2025-12-09', { count: 1, pnl: 160 }],
  ['2025-12-10', { count: 1, pnl: 95 }],
  ['2025-12-11', { count: 3, pnl: 80 }],
  ['2025-12-12', { count: 1, pnl: -210 }],

  ['2025-12-15', { count: 2, pnl: 200 }],
  ['2025-12-16', { count: 1, pnl: 150 }],
  ['2025-12-17', { count: 2, pnl: -130 }],
  ['2025-12-18', { count: 1, pnl: 75 }],
  ['2025-12-19', { count: 1, pnl: 60 }],

  ['2025-12-22', { count: 2, pnl: -160 }],
  ['2025-12-23', { count: 1, pnl: 120 }],
  ['2025-12-24', { count: 1, pnl: 90 }],
  ['2025-12-25', { count: 1, pnl: 210 }],
  ['2025-12-26', { count: 1, pnl: -70 }],

  ['2025-12-29', { count: 1, pnl: 180 }],
  ['2025-12-30', { count: 2, pnl: -95 }],
  ['2025-12-31', { count: 3, pnl: 260 }],
];

function buildWeeksForMonth(month: Date): Date[][] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const out: Date[][] = [];
  let currentWeekDays: Date[] = [];

  const firstDayOfWeek = getDay(monthStart);
  for (let i = 0; i < firstDayOfWeek; i += 1) currentWeekDays.push(new Date(0));

  monthDays.forEach((day, index) => {
    currentWeekDays.push(day);
    if (getDay(day) === 6 || index === monthDays.length - 1) {
      while (currentWeekDays.length < 7) currentWeekDays.push(new Date(0));
      out.push([...currentWeekDays]);
      currentWeekDays = [];
    }
  });

  return out;
}

export function HeroCalendarPreview() {
  const currentMonth = useMemo(() => DEMO_MONTH, []);
  const dayStats = useMemo(() => new Map<string, DayStat>(demoStats), []);
  const weeks = useMemo(() => buildWeeksForMonth(currentMonth), [currentMonth]);

  const getDayData = (day: Date) => {
    if (day.getTime() === 0) return null;
    const key = format(day, 'yyyy-MM-dd');
    const stat = dayStats.get(key);

    return {
      count: stat?.count ?? 0,
      pnl: stat?.pnl ?? 0,
      isClosed: !stat,
    };
  };

  const getWeekData = (week: Date[]) => {
    const validDays = week.filter((d) => d.getTime() !== 0);
    let totalWeekPnL = 0;
    let tradingDays = 0;

    for (const day of validDays) {
      const key = format(day, 'yyyy-MM-dd');
      const stat = dayStats.get(key);
      if (!stat) continue;
      tradingDays += 1;
      totalWeekPnL += stat.pnl;
    }

    return { pnl: totalWeekPnL, days: tradingDays };
  };

  const isToday = (day: Date) => day.getTime() !== 0 && isSameDay(day, new Date());

  return (
    <div aria-hidden="true" className="relative hidden lg:block w-full max-w-[560px] lg:ml-auto select-none">
      <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-tr from-[#34a85a]/20 via-transparent to-sky-500/20 blur-2xl" />

      <div className="relative max-h-[430px] overflow-hidden rounded-3xl shadow-2xl">
        <div className="pointer-events-none">
          <DashboardCalendarCard
            preview
            currentMonth={currentMonth}
            weeks={weeks}
            getDayData={getDayData}
            getWeekData={getWeekData}
            isToday={isToday}
          />
        </div>

        <div className="pointer-events-none absolute inset-y-0 left-0 w-[55%] bg-gradient-to-r from-background via-background/60 via-30% to-transparent" />
      </div>
    </div>
  );
}
