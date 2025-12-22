import { useMemo } from 'react';
import { useTheme } from '../../app/components/theme-provider';
import { cn } from '../../app/components/ui/utils';

type TradeDay = {
  pnl: number;
  trades: 1 | 2 | 3;
};

type WeekSummary = {
  label: `Week ${1 | 2 | 3 | 4 | 5}`;
  total: number;
  tradedDays: number;
};

type CalendarCell =
  | { kind: 'empty'; day: null }
  | { kind: 'closed'; day: number }
  | { kind: 'no-trade'; day: number }
  | { kind: 'trade'; day: number; pnl: number; trades: 1 | 2 | 3 };

const BRAND_GREEN_TEXT = 'text-[#34a85a]';
const BRAND_GREEN_BG_LIGHT = 'bg-[#34a85a]/10';
const BRAND_GREEN_BG_DARK = 'bg-[#34a85a]/12';

const tradesByDay: Record<number, TradeDay> = {
  1: { pnl: 180, trades: 2 },
  2: { pnl: -65, trades: 1 },
  3: { pnl: 210, trades: 1 },
  5: { pnl: -40, trades: 1 },

  8: { pnl: 95, trades: 1 },
  9: { pnl: 160, trades: 2 },
  10: { pnl: -80, trades: 1 },
  11: { pnl: 130, trades: 1 },
  12: { pnl: 70, trades: 1 },

  15: { pnl: 220, trades: 2 },
  16: { pnl: -150, trades: 3 },
  17: { pnl: 90, trades: 1 },
  19: { pnl: -40, trades: 1 },

  22: { pnl: 180, trades: 2 },
  23: { pnl: 110, trades: 1 },
  24: { pnl: -60, trades: 1 },
  25: { pnl: 200, trades: 2 },
  26: { pnl: 85, trades: 1 },

  29: { pnl: 150, trades: 1 },
  31: { pnl: 260, trades: 3 },
};

function resolveTheme(theme: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }
  return 'light';
}

function formatPnl(value: number) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString()}`;
}

function tradeLabel(trades: number) {
  return `${trades} ${trades === 1 ? 'trade' : 'trades'}`;
}

function isWeekendInDecember2025(day: number) {
  // December 1, 2025 is a Monday. Index: 0=Mon ... 6=Sun
  const dayIndex = (day - 1) % 7;
  return dayIndex === 5 || dayIndex === 6;
}

function buildCells(): CalendarCell[] {
  const daysInMonth = 31;
  const totalCells = 35; // 5 weeks shown (Dec 2025 starts on Monday)

  return Array.from({ length: totalCells }, (_, index) => {
    const day = index + 1;
    if (day > daysInMonth) return { kind: 'empty', day: null };

    if (isWeekendInDecember2025(day)) return { kind: 'closed', day };

    const trade = tradesByDay[day];
    if (trade) return { kind: 'trade', day, pnl: trade.pnl, trades: trade.trades };

    return { kind: 'no-trade', day };
  });
}

function buildWeekSummaries(): WeekSummary[] {
  const summaries: WeekSummary[] = [];

  for (let weekIndex = 0; weekIndex < 5; weekIndex += 1) {
    const startDay = weekIndex * 7 + 1;
    const endDay = Math.min(startDay + 6, 31);

    let total = 0;
    let tradedDays = 0;
    for (let day = startDay; day <= endDay; day += 1) {
      const trade = tradesByDay[day];
      if (!trade) continue;
      tradedDays += 1;
      total += trade.pnl;
    }

    summaries.push({
      label: `Week ${((weekIndex + 1) as 1 | 2 | 3 | 4 | 5)}`,
      total,
      tradedDays,
    });
  }

  return summaries;
}

function buildWeeks(): CalendarCell[][] {
  const cells = buildCells();
  return Array.from({ length: 5 }, (_, weekIndex) => cells.slice(weekIndex * 7, weekIndex * 7 + 7));
}

function CalendarPreviewCard({ isDark }: { isDark: boolean }) {
  const weeks = useMemo(() => buildWeeks(), []);
  const weekSummaries = useMemo(() => buildWeekSummaries(), []);

  const frame = cn(
    'relative overflow-hidden rounded-3xl border shadow-xl',
    isDark
      ? 'bg-[#0b1220] text-slate-100 border-white/10 shadow-black/40'
      : 'bg-white text-slate-900 border-slate-200/70 shadow-slate-900/10',
  );

  const muted = isDark ? 'text-slate-300/70' : 'text-slate-500';
  const divider = isDark ? 'border-white/10' : 'border-slate-200/70';
  const dayHeader = isDark ? 'text-slate-300/80' : 'text-slate-500';
  const tileBorder = isDark ? 'border-white/10' : 'border-slate-200/70';

  return (
    <div className={frame}>
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-16',
          isDark ? 'bg-gradient-to-b from-white/10 to-transparent' : 'bg-gradient-to-b from-slate-100/80 to-transparent',
        )}
      />

      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-[30%]',
          isDark
            ? 'bg-gradient-to-l from-white/8 via-white/0 to-transparent'
            : 'bg-gradient-to-l from-slate-50 via-white/0 to-transparent',
        )}
      />

      <div className="relative p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">Today · December 2025</p>
            <p className={cn('mt-0.5 text-xs', muted)}>Calendar preview • Demo P/L tiles</p>
          </div>
          <div
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-[11px] font-medium border',
              isDark ? 'bg-white/5 text-slate-200 border-white/10' : 'bg-slate-100 text-slate-700 border-slate-200',
            )}
          >
            Dec 1–31
          </div>
        </div>

        <div className={cn('mt-5 border-t', divider)} />

        <div className="mt-5">
          <div
            className={cn('grid grid-cols-8 gap-2 text-[11px] font-medium', dayHeader)}
            style={{ gridTemplateColumns: 'repeat(7,minmax(0,1fr)) 148px' }}
          >
            <span className="text-center">Mon</span>
            <span className="text-center">Tue</span>
            <span className="text-center">Wed</span>
            <span className="text-center">Thu</span>
            <span className="text-center">Fri</span>
            <span className="text-center">Sat</span>
            <span className="text-center">Sun</span>
            <span className="text-center">Week</span>
          </div>

          <div className="mt-2 space-y-2">
            {weeks.map((week, weekIndex) => {
              const weekSummary = weekSummaries[weekIndex];
              const weekPositive = weekSummary.total >= 0;
              const weekTotalColor = weekPositive
                ? BRAND_GREEN_TEXT
                : isDark
                  ? 'text-red-400'
                  : 'text-red-600';

              return (
                <div
                  key={weekSummary.label}
                  className="grid grid-cols-8 gap-2"
                  style={{ gridTemplateColumns: 'repeat(7,minmax(0,1fr)) 148px' }}
                >
                  {week.map((cell, idx) => {
                    const isTrade = cell.kind === 'trade';
                    const isClosed = cell.kind === 'closed';
                    const isEmpty = cell.kind === 'empty';
                    const isNoTrade = cell.kind === 'no-trade';

                    const pnl = isTrade ? cell.pnl : 0;
                    const isProfit = pnl >= 0;

                    const tileBg = isTrade
                      ? isProfit
                        ? isDark
                          ? BRAND_GREEN_BG_DARK
                          : BRAND_GREEN_BG_LIGHT
                        : isDark
                          ? 'bg-red-500/12'
                          : 'bg-red-500/10'
                      : isClosed
                        ? isDark
                          ? 'bg-white/4'
                          : 'bg-muted/30'
                        : isNoTrade
                          ? isDark
                            ? 'bg-white/3'
                            : 'bg-white'
                          : 'bg-transparent';

                    const pnlColor = isTrade
                      ? isProfit
                        ? BRAND_GREEN_TEXT
                        : isDark
                          ? 'text-red-400'
                          : 'text-red-600'
                      : muted;

                    return (
                      <div
                        key={`${weekIndex}-${idx}`}
                        className={cn(
                          'h-[88px] rounded-2xl border px-2.5 py-2 flex flex-col min-w-0 overflow-hidden',
                          tileBorder,
                          tileBg,
                          isEmpty ? 'opacity-0' : '',
                        )}
                      >
                        <div className={cn('text-[10px] font-medium leading-none', muted)}>{cell.day ?? ''}</div>

                        <div className="flex-1 min-h-0 flex items-center justify-center">
                          {isTrade ? (
                            <span className={cn('text-[13px] font-medium tabular-nums leading-none', pnlColor)}>
                              {formatPnl(cell.pnl).replace('.00', '')}
                            </span>
                          ) : (
                            <span className={cn('text-sm leading-none', muted)}>—</span>
                          )}
                        </div>

                        <div className={cn('text-[10px] leading-none text-center truncate', muted)}>
                          {isTrade ? tradeLabel(cell.trades) : isClosed ? 'Closed' : '—'}
                        </div>
                      </div>
                    );
                  })}

                  <div
                    className={cn(
                      'h-[88px] rounded-2xl border px-3 py-2 flex flex-col items-center justify-center text-center',
                      tileBorder,
                      isDark ? 'bg-white/5' : 'bg-muted/30',
                    )}
                  >
                    <div className={cn('text-[10px] font-medium leading-none', muted)}>{weekSummary.label}</div>
                    {weekSummary.tradedDays > 0 ? (
                      <>
                        <div className={cn('mt-1 text-[13px] font-medium tabular-nums leading-none', weekTotalColor)}>
                          {formatPnl(weekSummary.total).replace('.00', '')}
                        </div>
                        <div className={cn('mt-1 text-[10px] leading-none', muted)}>
                          {weekSummary.tradedDays} {weekSummary.tradedDays === 1 ? 'day' : 'days'}
                        </div>
                      </>
                    ) : (
                      <span className={cn('mt-1 text-sm leading-none', muted)}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroCalendarPreview() {
  const { theme } = useTheme();
  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);
  const isDark = resolvedTheme === 'dark';

  return (
    <div
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[560px] lg:ml-auto lg:-translate-x-10 xl:-translate-x-14 select-none"
    >
      <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-tr from-[#34a85a]/20 via-transparent to-sky-500/20 blur-2xl" />

      <div className="relative max-h-[440px] overflow-hidden">
        <CalendarPreviewCard isDark={isDark} />

        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-20',
            'bg-gradient-to-r from-background/95 via-background/70 via-40% to-transparent',
          )}
        />
      </div>
    </div>
  );
}
