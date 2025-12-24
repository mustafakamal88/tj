import { useMemo, useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { fetchTrades } from '../utils/trades-api';
import { filterTradesForFreeUser } from '../utils/data-limit';
import {
  calculateTotalPnL,
  calculateAveragePnL,
  calculateProfitFactor,
  formatCurrency,
} from '../utils/trade-calculations';
import type { Trade } from '../types/trade';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadialBarChart,
  RadialBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Target, DollarSign, Percent, Activity } from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { getFeatureAccess, requestUpgrade } from '../utils/feature-access';
import { useProfile } from '../utils/use-profile';
import { getEffectivePlan } from '../utils/entitlements';
import { pnlTextClass, semanticColors } from '../utils/semantic-colors';

type ChartPalette = {
  profit: string;
  loss: string;
  neutral: string;
  grid: string;
  text: string;
  muted: string;
};

function resolveOptionalHslVar(varName: string, fallbackHex: string): string {
  if (typeof window === 'undefined') return fallbackHex;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallbackHex;
  if (raw.startsWith('#') || raw.startsWith('hsl') || raw.startsWith('rgb')) return raw;
  return `hsl(${raw})`;
}

function useChartPalette(): ChartPalette {
  return useMemo(
    () => ({
      // Prefer CSS variables when present; otherwise use a minimal TJ brand fallback.
      profit: resolveOptionalHslVar('--chart-profit', '#22c55e'), // emerald-500
      loss: resolveOptionalHslVar('--chart-loss', '#ef4444'), // rose/red-500
      neutral: resolveOptionalHslVar('--chart-neutral', '#64748b'), // slate-500
      grid: 'hsl(var(--border))',
      text: 'hsl(var(--foreground))',
      muted: 'hsl(var(--muted-foreground))',
    }),
    [],
  );
}

function formatMoney(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${formatCurrency(abs)}`;
}

function formatPct(value: number | null | undefined, digits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

function formatShortDateLabel(d: Date): string {
  return format(d, 'MMM d');
}

function tradeTimestamp(t: Trade): Date | null {
  const raw = (t.openTime || t.closeTime || t.date) as unknown;
  if (typeof raw === 'string') {
    const dt = raw.includes('T') || /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseISO(raw) : new Date(raw);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
  const dt = new Date(raw as any);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function winLossDenom(trades: Trade[]): { wins: number; losses: number; denom: number } {
  const wins = trades.filter((t) => typeof t.pnl === 'number' && t.pnl > 0).length;
  const losses = trades.filter((t) => typeof t.pnl === 'number' && t.pnl < 0).length;
  return { wins, losses, denom: wins + losses };
}

function tradePnLValue(t: any): number {
  const candidates = [
    t?.pnl,
    t?.profit_loss,
    t?.profitLoss,
    t?.realized_pnl,
    t?.realizedPnL,
    t?.net_pnl,
    t?.netPnL,
  ];
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

function computeRMultiple(t: Trade): number | null {
  const entry = typeof t.entry === 'number' ? t.entry : null;
  const sl = typeof (t as any).stopLoss === 'number' ? (t as any).stopLoss : typeof (t as any).sl === 'number' ? (t as any).sl : null;
  const qty = typeof t.quantity === 'number' ? t.quantity : null;
  const pnl = typeof t.pnl === 'number' ? t.pnl : null;
  if (entry === null || sl === null || qty === null || pnl === null) return null;
  const riskDistance = Math.abs(entry - sl);
  const riskAmount = riskDistance > 0 ? riskDistance * qty : 0;
  if (!Number.isFinite(riskAmount) || riskAmount <= 0) return null;
  const r = pnl / riskAmount;
  return Number.isFinite(r) ? r : null;
}

function computePlannedRR(t: Trade): number | null {
  const entry = typeof t.entry === 'number' ? t.entry : null;
  const sl = typeof (t as any).stopLoss === 'number' ? (t as any).stopLoss : typeof (t as any).sl === 'number' ? (t as any).sl : null;
  const tp = typeof (t as any).takeProfit === 'number' ? (t as any).takeProfit : typeof (t as any).tp === 'number' ? (t as any).tp : null;
  if (entry === null || sl === null || tp === null) return null;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (!Number.isFinite(risk) || risk <= 0 || !Number.isFinite(reward)) return null;
  const rr = reward / risk;
  return Number.isFinite(rr) ? rr : null;
}

function TJTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border bg-background/95 p-2 shadow-sm">
      {label ? <div className="text-xs font-medium text-foreground mb-1">{label}</div> : null}
      <div className="space-y-1">
        {payload
          .filter((p: any) => p && p.value !== undefined && p.value !== null)
          .map((p: any) => (
            <div key={p.dataKey || p.name} className="flex items-center justify-between gap-6 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                <span className="text-muted-foreground truncate">{p.name ?? p.dataKey}</span>
              </div>
              <span className="tabular-nums text-foreground">
                {typeof p.value === 'number' ? p.value : String(p.value)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

export function Analytics() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [riskIssueFilter, setRiskIssueFilter] = useState<string | null>(null);
  const { profile } = useProfile();
  const effectivePlan = getEffectivePlan(profile);
  const access = getFeatureAccess(effectivePlan);

  const chart = useChartPalette();

  const tradesArray: Trade[] = Array.isArray(trades) ? trades : [];

  const refreshTrades = async () => {
    const allTrades = await fetchTrades();
    const filteredTrades = effectivePlan === 'free' ? filterTradesForFreeUser(allTrades) : allTrades;
    setTrades(filteredTrades);
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
  }, [effectivePlan]);

  const stats = useMemo(() => {
    const totalPnL = tradesArray.reduce((sum, t) => sum + tradePnLValue(t), 0);
    const averagePnL = tradesArray.length > 0 ? totalPnL / tradesArray.length : 0;
    const profitFactor = calculateProfitFactor(tradesArray);

    const wins = tradesArray.filter((t) => t.outcome === 'win');
    const losses = tradesArray.filter((t) => t.outcome === 'loss');
    const breakevens = tradesArray.filter((t) => t.outcome === 'breakeven');

    const wl = winLossDenom(tradesArray);
    const winRate = wl.denom > 0 ? (wl.wins / wl.denom) * 100 : 0;

    const totalWinAmount = wins.reduce((sum, t) => sum + tradePnLValue(t), 0);
    const totalLossAmount = losses.reduce((sum, t) => sum + tradePnLValue(t), 0);
    const averageWin = wins.length > 0 ? totalWinAmount / wins.length : 0;
    const averageLoss = losses.length > 0 ? totalLossAmount / losses.length : 0;

    const longTrades = tradesArray.filter((t) => t.type === 'long');
    const shortTrades = tradesArray.filter((t) => t.type === 'short');
    const longWin = winLossDenom(longTrades);
    const shortWin = winLossDenom(shortTrades);
    const longWR = longWin.denom > 0 ? (longWin.wins / longWin.denom) * 100 : 0;
    const shortWR = shortWin.denom > 0 ? (shortWin.wins / shortWin.denom) * 100 : 0;

    return {
      totalPnL,
      averagePnL,
      profitFactor,
      winRate,
      wins,
      losses,
      breakevens,
      averageWin,
      averageLoss,
      longTrades,
      shortTrades,
      longWR,
      shortWR,
    };
  }, [tradesArray]);

  const totalPnL = typeof stats.totalPnL === 'number' && Number.isFinite(stats.totalPnL) ? stats.totalPnL : 0;
  const averagePnL = typeof stats.averagePnL === 'number' && Number.isFinite(stats.averagePnL) ? stats.averagePnL : 0;

  const equityCurveData = useMemo(() => {
    const sorted = [...tradesArray]
      .map((t) => ({ t, dt: tradeTimestamp(t) }))
      .filter((x) => x.dt)
      .sort((a, b) => (a.dt as Date).getTime() - (b.dt as Date).getTime());

    let equity = 0;
    return sorted.map(({ t, dt }) => {
      const pnl = tradePnLValue(t);
      equity += pnl;
      return {
        date: format(dt as Date, 'MMM d'),
        equity,
        pnl,
      };
    });
  }, [tradesArray]);

  const outcomeData = useMemo(() => {
    const total = tradesArray.length;
    const items = [
      { name: 'Wins', value: stats.wins.length, color: chart.profit },
      { name: 'Losses', value: stats.losses.length, color: chart.loss },
      { name: 'Breakeven', value: stats.breakevens.length, color: chart.neutral },
    ].filter((d) => d.value > 0);

    return { total, items };
  }, [tradesArray.length, stats.wins.length, stats.losses.length, stats.breakevens.length, chart.profit, chart.loss, chart.neutral]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; pnl: number; trades: number; sortKey: number }>();
    for (const t of tradesArray) {
      const dt = tradeTimestamp(t);
      if (!dt) continue;
      const key = format(dt, 'yyyy-MM');
      const label = format(dt, 'MMM yyyy');
      const existing = map.get(key);
      const pnl = tradePnLValue(t);
      if (existing) {
        existing.pnl += pnl;
        existing.trades += 1;
      } else {
        map.set(key, { month: label, pnl, trades: 1, sortKey: dt.getFullYear() * 100 + (dt.getMonth() + 1) });
      }
    }
    return [...map.values()].sort((a, b) => a.sortKey - b.sortKey);
  }, [tradesArray]);

  const topSymbols = useMemo(() => {
    const symbolStats = tradesArray.reduce((acc, trade) => {
      const symbol = String(trade.symbol || '').trim() || '—';
      if (!acc[symbol]) {
        acc[symbol] = { count: 0, pnl: 0, wins: 0, losses: 0 };
      }
      acc[symbol].count += 1;
      acc[symbol].pnl += tradePnLValue(trade);
      if (trade.outcome === 'win') acc[symbol].wins += 1;
      if (trade.outcome === 'loss') acc[symbol].losses += 1;
      return acc;
    }, {} as Record<string, { count: number; pnl: number; wins: number; losses: number }>);

    return Object.entries(symbolStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
  }, [tradesArray]);

  const overtrading = useMemo(() => {
    if (tradesArray.length === 0) {
      return {
        series: [] as Array<{ day: string; trades: number; rollingAvg7: number; overtrade: number | null }>,
        avgTradesPerDay: 0,
        peakTradesPerDay: 0,
        overtradeDays: 0,
        mostActiveWeekday: '—',
      };
    }

    const dated = tradesArray
      .map((t) => ({ t, dt: tradeTimestamp(t) }))
      .filter((x) => x.dt)
      .sort((a, b) => (a.dt as Date).getTime() - (b.dt as Date).getTime());

    const end = dated[dated.length - 1].dt as Date;
    const start = subDays(end, 59);

    const perDay = new Map<string, number>();
    const weekdayCounts = new Map<string, number>();
    for (const { dt } of dated) {
      const d = dt as Date;
      if (d.getTime() < start.getTime() || d.getTime() > end.getTime()) continue;
      const key = format(d, 'yyyy-MM-dd');
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
      const wd = format(d, 'EEE');
      weekdayCounts.set(wd, (weekdayCounts.get(wd) ?? 0) + 1);
    }

    const series: Array<{ day: string; trades: number; rollingAvg7: number; overtrade: number | null }> = [];
    const window: number[] = [];
    for (let i = 0; i < 60; i++) {
      const d = subDays(end, 59 - i);
      const key = format(d, 'yyyy-MM-dd');
      const tradesCount = perDay.get(key) ?? 0;
      window.push(tradesCount);
      if (window.length > 7) window.shift();
      const rollingAvg7 = window.reduce((a, b) => a + b, 0) / window.length;
      const threshold = Math.max(rollingAvg7 * 1.8, 8);
      const overtrade = tradesCount > threshold ? tradesCount : null;
      series.push({ day: formatShortDateLabel(d), trades: tradesCount, rollingAvg7, overtrade });
    }

    const totalTrades = series.reduce((sum, x) => sum + x.trades, 0);
    const avgTradesPerDay = totalTrades / series.length;
    const peakTradesPerDay = Math.max(...series.map((x) => x.trades));
    const overtradeDays = series.filter((x) => x.overtrade !== null).length;
    const mostActiveWeekday =
      [...weekdayCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

    return { series, avgTradesPerDay, peakTradesPerDay, overtradeDays, mostActiveWeekday };
  }, [tradesArray]);

  const riskDiscipline = useMemo(() => {
    const total = tradesArray.length;
    if (total === 0) {
      return {
        slSetRate: null as number | null,
        rrGoodRate: null as number | null,
        tpMissingRate: null as number | null,
        issues: [] as Array<{ key: string; label: string; count: number; examples: Trade[] }>,
        disciplineScore: null as number | null,
      };
    }

    let missingSL = 0;
    let missingTP = 0;
    let rrKnown = 0;
    let rrGood = 0;
    let rrBad = 0;

    const issueExamples: Record<string, Trade[]> = {
      missing_sl: [],
      rr_lt_1: [],
      oversized: [],
    };

    const sizes: number[] = [];
    for (const t of tradesArray) {
      const size = typeof (t as any).size === 'number' ? (t as any).size : null;
      if (size !== null && Number.isFinite(size)) sizes.push(size);
    }
    sizes.sort((a, b) => a - b);
    const sizeOutlierThreshold = sizes.length >= 20 ? sizes[Math.floor(sizes.length * 0.95)] : null;

    for (const t of tradesArray) {
      const sl = typeof (t as any).stopLoss === 'number' ? (t as any).stopLoss : typeof (t as any).sl === 'number' ? (t as any).sl : null;
      const tp = typeof (t as any).takeProfit === 'number' ? (t as any).takeProfit : typeof (t as any).tp === 'number' ? (t as any).tp : null;
      if (sl === null) {
        missingSL += 1;
        if (issueExamples.missing_sl.length < 5) issueExamples.missing_sl.push(t);
      }
      if (tp === null) missingTP += 1;

      const rr = computePlannedRR(t);
      if (typeof rr === 'number') {
        rrKnown += 1;
        if (rr >= 1.5) rrGood += 1;
        if (rr < 1.0) {
          rrBad += 1;
          if (issueExamples.rr_lt_1.length < 5) issueExamples.rr_lt_1.push(t);
        }
      }

      const size = typeof (t as any).size === 'number' ? (t as any).size : null;
      if (sizeOutlierThreshold !== null && size !== null && size > sizeOutlierThreshold) {
        if (issueExamples.oversized.length < 5) issueExamples.oversized.push(t);
      }
    }

    const slSetRate = total > 0 ? ((total - missingSL) / total) * 100 : null;
    const tpMissingRate = total > 0 ? (missingTP / total) * 100 : null;
    const rrGoodRate = rrKnown > 0 ? (rrGood / rrKnown) * 100 : null;

    const issues: Array<{ key: string; label: string; count: number; examples: Trade[] }> = [];
    if (missingSL > 0) issues.push({ key: 'missing_sl', label: 'Missing SL', count: missingSL, examples: issueExamples.missing_sl });
    if (rrBad > 0) issues.push({ key: 'rr_lt_1', label: 'RR < 1.0', count: rrBad, examples: issueExamples.rr_lt_1 });
    if (issueExamples.oversized.length > 0) issues.push({ key: 'oversized', label: 'Oversized trade', count: issueExamples.oversized.length, examples: issueExamples.oversized });
    issues.sort((a, b) => b.count - a.count);

    const disciplineScore = (() => {
      if (slSetRate === null) return null;
      const rrScore = typeof rrGoodRate === 'number' ? rrGoodRate : null;
      if (rrScore === null) return slSetRate;
      return 0.7 * slSetRate + 0.3 * rrScore;
    })();

    return { slSetRate, rrGoodRate, tpMissingRate, issues, disciplineScore };
  }, [tradesArray]);

  const tjScore = useMemo(() => {
    if (tradesArray.length === 0) return [] as Array<{ metric: string; score: number }>;

    const items: Array<{ metric: string; score: number }> = [];

    // Win%
    items.push({ metric: 'Win%', score: Math.max(0, Math.min(100, stats.winRate)) });

    // Profit factor (0–3 → 0–100)
    const pf = stats.profitFactor === Infinity ? 3 : Math.max(0, Math.min(3, stats.profitFactor));
    items.push({ metric: 'Profit Factor', score: (pf / 3) * 100 });

    // Avg R (derived)
    const rValues = tradesArray.map(computeRMultiple).filter((v): v is number => typeof v === 'number');
    if (rValues.length > 0) {
      const avgR = rValues.reduce((a, b) => a + b, 0) / rValues.length;
      const clamped = Math.max(-1, Math.min(3, avgR));
      items.push({ metric: 'Avg R', score: ((clamped + 1) / 4) * 100 });
    }

    // Consistency (based on daily pnl volatility)
    const daily = new Map<string, number>();
    for (const t of tradesArray) {
      const dt = tradeTimestamp(t);
      if (!dt) continue;
      const key = format(dt, 'yyyy-MM-dd');
      daily.set(key, (daily.get(key) ?? 0) + tradePnLValue(t));
    }
    const dailyPnL = [...daily.values()];
    if (dailyPnL.length >= 5) {
      const mean = dailyPnL.reduce((a, b) => a + b, 0) / dailyPnL.length;
      const variance = dailyPnL.reduce((sum, x) => sum + (x - mean) * (x - mean), 0) / dailyPnL.length;
      const std = Math.sqrt(variance);
      const denom = Math.max(1, Math.abs(mean));
      const cv = std / denom;
      const normalized = Math.max(0, Math.min(1, 1 - Math.min(cv / 2, 1)));
      items.push({ metric: 'Consistency', score: normalized * 100 });
    }

    // Discipline (from risk discipline)
    if (typeof riskDiscipline.disciplineScore === 'number') {
      items.push({ metric: 'Discipline', score: Math.max(0, Math.min(100, riskDiscipline.disciplineScore)) });
    }

    return items;
  }, [tradesArray, stats.winRate, stats.profitFactor, riskDiscipline.disciplineScore]);

  if (!Array.isArray(trades)) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="p-12 text-center">
            <Activity className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-2">Unable to load analytics</p>
            <p className="text-sm text-muted-foreground">Trade data was not available. Please refresh and try again.</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
              <p className="text-sm text-muted-foreground">Performance overview and key patterns</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="tabular-nums">
                {tradesArray.length} trades
              </Badge>
              <Badge variant="secondary">{effectivePlan.toUpperCase()}</Badge>
            </div>
          </div>
        </div>

        {!access.advanced_analytics ? (
          <Card className="p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Advanced analytics are a Pro feature</h2>
                <p className="text-sm text-muted-foreground">
                  Upgrade to unlock imports, broker connect, and the full analytics dashboard.
                </p>
              </div>
              <Button onClick={() => requestUpgrade('advanced_analytics')}>Upgrade</Button>
            </div>
          </Card>
        ) : tradesArray.length === 0 ? (
          <Card className="p-12 text-center">
            <Activity className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-2">No trading data yet</p>
            <p className="text-sm text-muted-foreground">Start adding trades to see your analytics</p>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Total P&L</span>
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className={`mt-2 text-2xl font-semibold tabular-nums ${pnlTextClass(totalPnL)}`}>
                  {formatCurrency(totalPnL)}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Win Rate</span>
                  <Percent className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{stats.winRate.toFixed(1)}%</div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {stats.wins.length}W / {stats.losses.length}L
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg P&L</span>
                  <Target className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className={`mt-2 text-2xl font-semibold tabular-nums ${pnlTextClass(averagePnL)}`}>
                  {formatCurrency(averagePnL)}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Profit Factor</span>
                  <Activity className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  {stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
                </div>
              </Card>
            </div>

            {/* TJ Score + Overtrading */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-base font-semibold">TJ Score</h2>
                    <p className="text-xs text-muted-foreground">Execution snapshot</p>
                  </div>
                </div>
                {tjScore.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not enough data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <RadarChart data={tjScore}>
                      <PolarGrid stroke={chart.grid} />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: chart.muted, fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar
                        name="TJ Score"
                        dataKey="score"
                        stroke={chart.neutral}
                        fill={chart.profit}
                        fillOpacity={0.18}
                        strokeWidth={2}
                      />
                      <Tooltip content={<TJTooltip />} formatter={(v: number) => [`${v.toFixed(0)}`, 'Score']} />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card className="p-6 lg:col-span-2">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-base font-semibold">Overtrading Detector</h2>
                    <p className="text-xs text-muted-foreground">Last 60 days</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Avg trades/day</div>
                    <div className="font-semibold tabular-nums">{overtrading.avgTradesPerDay.toFixed(1)}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Peak trades/day</div>
                    <div className="font-semibold tabular-nums">{overtrading.peakTradesPerDay}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Overtrade days</div>
                    <div className={`font-semibold tabular-nums ${overtrading.overtradeDays > 0 ? semanticColors.lossText : 'text-foreground'}`}>
                      {overtrading.overtradeDays}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">Most active weekday</div>
                    <div className="font-semibold tabular-nums">{overtrading.mostActiveWeekday}</div>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={overtrading.series} margin={{ left: 6, right: 6, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke={chart.grid} strokeOpacity={0.5} strokeDasharray="4 4" />
                    <XAxis dataKey="day" tick={{ fill: chart.muted, fontSize: 11 }} interval={9} />
                    <YAxis tick={{ fill: chart.muted, fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      content={<TJTooltip />}
                      formatter={(v: number, name: string) => [
                        typeof v === 'number' ? v.toFixed(1) : v,
                        name === 'rollingAvg7' ? 'Rolling avg (7d)' : name === 'overtrade' ? 'Overtrade' : 'Trades',
                      ]}
                    />
                    <Legend wrapperStyle={{ color: chart.muted, fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="trades"
                      name="Trades/day"
                      stroke={chart.neutral}
                      fill={chart.neutral}
                      fillOpacity={0.10}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="rollingAvg7"
                      name="Rolling avg (7d)"
                      stroke={chart.profit}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="overtrade"
                      name="Overtrade"
                      stroke="transparent"
                      dot={{ r: 4, fill: chart.loss, stroke: chart.loss }}
                      activeDot={{ r: 5, fill: chart.loss, stroke: chart.loss }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>

                <p className="mt-3 text-xs text-muted-foreground">
                  Overtrading often correlates with revenge/FOMO. Review those days in the calendar.
                </p>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-6 lg:col-span-2">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-base font-semibold">Equity Curve</h2>
                    <p className="text-xs text-muted-foreground">Cumulative P&L over time</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={equityCurveData}>
                    <CartesianGrid stroke={chart.grid} strokeOpacity={0.5} strokeDasharray="4 4" />
                    <XAxis dataKey="date" tick={{ fill: chart.muted, fontSize: 11 }} />
                    <YAxis tick={{ fill: chart.muted, fontSize: 11 }} />
                    <Tooltip content={<TJTooltip />} formatter={(v: number) => [formatMoney(v), 'Equity']} />
                    <Line type="monotone" dataKey="equity" name="Equity" stroke={chart.profit} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-6">
                <h2 className="text-base font-semibold">Most Traded</h2>
                <p className="text-xs text-muted-foreground">Top symbols by trade count</p>
                <div className="mt-4 space-y-2">
                  {topSymbols.map(([symbol, stats]) => (
                    <div key={symbol} className="flex items-center justify-between rounded-md border bg-background/40 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{symbol}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{stats.count} trades</div>
                      </div>
                      <div className={`text-sm font-semibold tabular-nums ${pnlTextClass(stats.pnl)}`}>
                        {formatCurrency(stats.pnl)}
                      </div>
                    </div>
                  ))}
                  {topSymbols.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3">No data available</p>
                  ) : null}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-6">
                <h2 className="text-base font-semibold">Win/Loss</h2>
                <p className="text-xs text-muted-foreground">Outcome distribution</p>
                <div className="mt-4">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={outcomeData.items}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }: any) => {
                          if (!percent) return '';
                          const pct = Math.round(percent * 100);
                          return pct >= 8 ? `${name} ${pct}%` : '';
                        }}
                        outerRadius={90}
                        dataKey="value"
                      >
                        {outcomeData.items.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={<TJTooltip />}
                        formatter={(v: number, name: string) => [v, name]}
                      />
                      <Legend wrapperStyle={{ color: chart.muted, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {monthlyData.length > 0 ? (
                <Card className="p-6 lg:col-span-2">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-base font-semibold">Monthly Performance</h2>
                      <p className="text-xs text-muted-foreground">P&L by month</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid stroke={chart.grid} strokeOpacity={0.5} strokeDasharray="4 4" />
                      <XAxis dataKey="month" tick={{ fill: chart.muted, fontSize: 11 }} />
                      <YAxis tick={{ fill: chart.muted, fontSize: 11 }} />
                      <ReferenceLine y={0} stroke={chart.grid} strokeOpacity={0.9} />
                      <Tooltip
                        content={<TJTooltip />}
                        formatter={(value: number) => [formatMoney(value), 'P/L']}
                      />
                      <Bar dataKey="pnl" name="P/L" radius={[6, 6, 0, 0]}>
                        {monthlyData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? chart.profit : chart.loss} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              ) : null}
            </div>

            {/* Risk discipline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-base font-semibold">Risk Discipline</h2>
                    <p className="text-xs text-muted-foreground">Stop loss & RR quality</p>
                  </div>
                  {riskIssueFilter ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => setRiskIssueFilter(null)}>
                      Clear
                    </Button>
                  ) : null}
                </div>

                <ResponsiveContainer width="100%" height={220}>
                  <RadialBarChart
                    innerRadius="55%"
                    outerRadius="95%"
                    data={[
                      {
                        name: 'SL set',
                        value: typeof riskDiscipline.slSetRate === 'number' ? riskDiscipline.slSetRate : 0,
                        fill: chart.profit,
                      },
                      {
                        name: 'RR ≥ 1.5',
                        value: typeof riskDiscipline.rrGoodRate === 'number' ? riskDiscipline.rrGoodRate : 0,
                        fill: chart.neutral,
                      },
                    ].filter((d) => d.name !== 'RR ≥ 1.5' || typeof riskDiscipline.rrGoodRate === 'number')}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <Tooltip
                      content={<TJTooltip />}
                      formatter={(v: number, name: string) => [formatPct(v, 0), name]}
                    />
                    <RadialBar
                      background={{ fill: chart.loss, opacity: 0.12 }}
                      dataKey="value"
                      cornerRadius={10}
                    />
                    <Legend wrapperStyle={{ color: chart.muted, fontSize: 12 }} />
                  </RadialBarChart>
                </ResponsiveContainer>

                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">SL set rate</div>
                    <div className="font-semibold tabular-nums">
                      {typeof riskDiscipline.slSetRate === 'number' ? formatPct(riskDiscipline.slSetRate, 0) : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">RR ≥ 1.5</div>
                    <div className="font-semibold tabular-nums">
                      {typeof riskDiscipline.rrGoodRate === 'number' ? formatPct(riskDiscipline.rrGoodRate, 0) : '—'}
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 lg:col-span-2">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-base font-semibold">Most Common Discipline Issues</h2>
                    <p className="text-xs text-muted-foreground">Tap a row to inspect examples</p>
                  </div>
                </div>

                {riskDiscipline.issues.length === 0 ? (
                  <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                    No obvious discipline issues detected.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {riskDiscipline.issues.map((issue) => {
                      const active = riskIssueFilter === issue.key;
                      return (
                        <button
                          key={issue.key}
                          type="button"
                          className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left bg-muted/20 hover:bg-muted/30 transition-colors ${
                            active ? 'ring-2 ring-primary/40' : ''
                          }`}
                          onClick={() => setRiskIssueFilter((prev) => (prev === issue.key ? null : issue.key))}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{issue.label}</div>
                          </div>
                          <Badge variant="outline" className="text-[11px] tabular-nums">{issue.count}</Badge>
                        </button>
                      );
                    })}
                  </div>
                )}

                {riskIssueFilter ? (
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground mb-2">Examples</div>
                    <div className="space-y-2">
                      {(riskDiscipline.issues.find((x) => x.key === riskIssueFilter)?.examples ?? []).map((t) => {
                        const dt = tradeTimestamp(t);
                        return (
                          <div key={t.id} className="flex items-center justify-between rounded-md border bg-background/40 px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{t.symbol}</div>
                              <div className="text-xs text-muted-foreground tabular-nums">{dt ? format(dt, 'MMM d, HH:mm') : t.date}</div>
                            </div>
                            <div className={`text-sm font-semibold tabular-nums ${pnlTextClass(t.pnl)}`}>{formatCurrency(t.pnl)}</div>
                          </div>
                        );
                      })}
                      {(riskDiscipline.issues.find((x) => x.key === riskIssueFilter)?.examples ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No examples available.</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg Win</span>
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className={`mt-2 text-xl font-semibold tabular-nums ${semanticColors.profitText}`}>{formatCurrency(stats.averageWin)}</div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg Loss</span>
                  <TrendingDown className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className={`mt-2 text-xl font-semibold tabular-nums ${semanticColors.lossText}`}>{formatCurrency(stats.averageLoss)}</div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Long</span>
                  <Badge variant="secondary" className="tabular-nums">{stats.longTrades.length}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground tabular-nums flex items-center justify-between">
                  <span>Win Rate</span>
                  <span className={`font-medium ${stats.longWR >= 50 ? semanticColors.profitText : semanticColors.lossText}`}>
                    {stats.longWR.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-2 rounded bg-muted/40 overflow-hidden">
                  <div
                    className="h-full"
                    style={{ width: `${Math.max(0, Math.min(100, stats.longWR))}%`, background: chart.profit, opacity: 0.9 }}
                  />
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Short</span>
                  <Badge variant="secondary" className="tabular-nums">{stats.shortTrades.length}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground tabular-nums flex items-center justify-between">
                  <span>Win Rate</span>
                  <span className={`font-medium ${stats.shortWR >= 50 ? semanticColors.profitText : semanticColors.lossText}`}>
                    {stats.shortWR.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-2 rounded bg-muted/40 overflow-hidden">
                  <div
                    className="h-full"
                    style={{ width: `${Math.max(0, Math.min(100, stats.shortWR))}%`, background: chart.profit, opacity: 0.9 }}
                  />
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">Broker Metrics</h2>
                  <p className="text-xs text-muted-foreground">Coming soon</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Broker metrics integration will be added in a future update. Analytics above are based on the trades
                already stored in your journal.
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
