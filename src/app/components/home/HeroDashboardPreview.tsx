import { cn } from '../ui/utils';

type PreviewVariant = 'light' | 'dark';

type WeekDay = {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  pnl: number;
  trades: number;
};

type TradeRow = {
  symbol: string;
  side: 'Long' | 'Short';
  pnl: number;
  strategy: string;
};

const week: WeekDay[] = [
  { day: 'Mon', pnl: 312, trades: 5 },
  { day: 'Tue', pnl: -84, trades: 3 },
  { day: 'Wed', pnl: 560, trades: 7 },
  { day: 'Thu', pnl: 130, trades: 2 },
  { day: 'Fri', pnl: -120, trades: 4 },
  { day: 'Sat', pnl: 210, trades: 2 },
  { day: 'Sun', pnl: 0, trades: 0 },
];

const recentTrades: TradeRow[] = [
  { symbol: 'ES', side: 'Long', pnl: 180, strategy: 'Breakout' },
  { symbol: 'AAPL', side: 'Short', pnl: -65, strategy: 'Mean reversion' },
  { symbol: 'EURUSD', side: 'Long', pnl: 95, strategy: 'Pullback' },
  { symbol: 'BTCUSD', side: 'Short', pnl: 140, strategy: 'Trend' },
];

function formatMoney(value: number) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString()}`;
}

function DashboardPreviewCard({ variant, className }: { variant: PreviewVariant; className?: string }) {
  const isDark = variant === 'dark';
  const title = isDark ? 'Dashboard (Dark)' : 'Dashboard (Light)';
  const maxAbsPnl = Math.max(...week.map((d) => Math.abs(d.pnl)), 1);
  const netPnl = week.reduce((sum, d) => sum + d.pnl, 0);
  const totalTrades = week.reduce((sum, d) => sum + d.trades, 0);

  const frame = cn(
    'relative overflow-hidden rounded-2xl ring-1',
    'h-[340px] sm:h-[360px] lg:h-[380px]',
    isDark
      ? 'bg-[#0b1220] text-slate-100 ring-white/10 shadow-[0_28px_70px_-34px_rgba(0,0,0,0.75)]'
      : 'bg-white text-slate-900 ring-slate-900/10 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.35)]',
    className,
  );

  const muted = isDark ? 'text-slate-300/75' : 'text-slate-500';
  const panel = isDark ? 'bg-white/5 ring-white/10' : 'bg-slate-50 ring-slate-900/10';
  const panelSolid = isDark ? 'bg-white/5 ring-white/10' : 'bg-white ring-slate-900/10';
  const divider = isDark ? 'border-white/10' : 'border-slate-200/70';
  const tile = isDark ? 'bg-white/5 ring-white/10' : 'bg-white ring-slate-900/10';
  const tileMuted = isDark ? 'bg-black/20 text-slate-200 ring-white/10' : 'bg-slate-100 text-slate-600 ring-slate-900/10';
  const good = isDark ? 'text-emerald-300' : 'text-emerald-600';
  const bad = isDark ? 'text-rose-300' : 'text-rose-600';

  return (
    <div className={frame}>
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-14',
          isDark ? 'bg-gradient-to-b from-white/10 to-transparent' : 'bg-gradient-to-b from-slate-100/80 to-transparent',
        )}
      />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{title}</p>
            <p className={cn('mt-0.5 text-xs', muted)}>Demo account • Last 7 days</p>
          </div>
          <div
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-[11px] font-medium ring-1',
              isDark ? 'bg-white/5 text-slate-200 ring-white/10' : 'bg-slate-100 text-slate-700 ring-slate-900/10',
            )}
          >
            Mon–Sun
          </div>
        </div>

        <div className={cn('mt-4 grid grid-cols-3 overflow-hidden rounded-xl ring-1', panel)}>
          <div className="px-3 py-2.5">
            <p className={cn('text-[10px] font-medium uppercase tracking-wide', muted)}>Win rate</p>
            <p className="mt-0.5 text-sm font-semibold">61%</p>
          </div>
          <div className={cn('px-3 py-2.5 border-l', divider)}>
            <p className={cn('text-[10px] font-medium uppercase tracking-wide', muted)}>Net P/L</p>
            <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', netPnl >= 0 ? good : bad)}>
              {formatMoney(netPnl)}
            </p>
          </div>
          <div className={cn('px-3 py-2.5 border-l', divider)}>
            <p className={cn('text-[10px] font-medium uppercase tracking-wide', muted)}>Trades</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">{totalTrades}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className={cn('text-[11px] font-semibold uppercase tracking-wide', muted)}>Week</p>
            <p className={cn('text-[11px]', muted)}>Daily P/L • Count</p>
          </div>

          <div className="mt-2 space-y-1.5">
            {week.map((day) => {
              const pct = Math.round((Math.abs(day.pnl) / maxAbsPnl) * 100);
              const isPositive = day.pnl >= 0;
              const valueColor = isPositive ? good : bad;

              return (
                <div key={day.day} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 ring-1', tile)}>
                  <p className="w-10 text-xs font-semibold">{day.day}</p>
                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <p className={cn('w-[74px] text-xs font-semibold tabular-nums', valueColor)}>
                      {formatMoney(day.pnl)}
                    </p>
                    <div className={cn('h-1 flex-1 rounded-full', isDark ? 'bg-white/10' : 'bg-slate-200')}>
                      <div
                        className={cn('h-1 rounded-full', isPositive ? (isDark ? 'bg-emerald-400/80' : 'bg-emerald-500/80') : isDark ? 'bg-rose-400/80' : 'bg-rose-500/80')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className={cn('shrink-0 rounded-md px-2 py-1 text-[10px] font-medium ring-1', tileMuted)}>
                    {day.trades} {day.trades === 1 ? 'trade' : 'trades'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className={cn('mt-4 overflow-hidden rounded-xl ring-1', panelSolid)}>
          <div className={cn('flex items-center justify-between px-3 py-2 border-b', divider)}>
            <p className="text-xs font-semibold">Recent trades</p>
            <p className={cn('text-[11px]', muted)}>Today</p>
          </div>
          <div className={cn('divide-y', isDark ? 'divide-white/10' : 'divide-slate-100')}>
            {recentTrades.map((trade) => (
              <div key={`${trade.symbol}-${trade.strategy}-${trade.side}`} className="px-3 py-2 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold truncate">
                    {trade.symbol} <span className={cn('font-medium', muted)}>• {trade.strategy}</span>
                  </p>
                  <p className={cn('mt-0.5 text-[10px]', muted)}>{trade.side}</p>
                </div>
                <p className={cn('text-[11px] font-semibold tabular-nums', trade.pnl >= 0 ? good : bad)}>
                  {formatMoney(trade.pnl)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroDashboardPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[520px] lg:ml-auto select-none">
      <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-tr from-[#34a85a]/20 via-transparent to-sky-500/20 blur-2xl" />

      <div className="relative overflow-visible">
        <div className="hidden md:block absolute right-0 top-0 -translate-y-10 translate-x-10">
          <DashboardPreviewCard variant="dark" />
        </div>

        <div className="relative z-10">
          <DashboardPreviewCard variant="light" />
        </div>

        <div className="pointer-events-none absolute inset-y-0 -left-8 w-24 bg-gradient-to-r from-background via-background/70 to-transparent z-20" />
      </div>
    </div>
  );
}

