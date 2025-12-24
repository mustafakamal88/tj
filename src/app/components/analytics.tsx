import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { fetchTrades } from '../utils/trades-api';
import { filterTradesForFreeUser } from '../utils/data-limit';
import {
  calculateWinRate,
  calculateTotalPnL,
  calculateAveragePnL,
  calculateProfitFactor,
  formatCurrency,
} from '../utils/trade-calculations';
import type { Trade } from '../types/trade';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Target, DollarSign, Percent, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { getFeatureAccess, requestUpgrade } from '../utils/feature-access';
import { useProfile } from '../utils/use-profile';
import { getEffectivePlan } from '../utils/entitlements';

export function Analytics() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const { profile } = useProfile();
  const effectivePlan = getEffectivePlan(profile);
  const access = getFeatureAccess(effectivePlan);

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

  // Calculate statistics
  const totalPnL = calculateTotalPnL(trades);
  const averagePnL = calculateAveragePnL(trades);
  const winRate = calculateWinRate(trades);
  const profitFactor = calculateProfitFactor(trades);

  const wins = trades.filter(t => t.outcome === 'win');
  const losses = trades.filter(t => t.outcome === 'loss');
  const breakevens = trades.filter(t => t.outcome === 'breakeven');

  const totalWinAmount = wins.reduce((sum, t) => sum + t.pnl, 0);
  const totalLossAmount = losses.reduce((sum, t) => sum + t.pnl, 0);
  const averageWin = wins.length > 0 ? totalWinAmount / wins.length : 0;
  const averageLoss = losses.length > 0 ? totalLossAmount / losses.length : 0;

  const longTrades = trades.filter(t => t.type === 'long');
  const shortTrades = trades.filter(t => t.type === 'short');

  // Prepare chart data
  const equityCurveData = trades
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .reduce((acc, trade, index) => {
      const previousEquity = index === 0 ? 0 : acc[index - 1].equity;
      acc.push({
        date: format(new Date(trade.date), 'MMM dd'),
        equity: previousEquity + trade.pnl,
        pnl: trade.pnl,
      });
      return acc;
    }, [] as Array<{ date: string; equity: number; pnl: number }>);

  const outcomeData = [
    { name: 'Wins', value: wins.length, color: '#22c55e' },
    { name: 'Losses', value: losses.length, color: '#ef4444' },
    { name: 'Breakeven', value: breakevens.length, color: '#94a3b8' },
  ].filter(d => d.value > 0);

  const monthlyData = trades.reduce((acc, trade) => {
    const month = format(new Date(trade.date), 'MMM yyyy');
    const existing = acc.find(d => d.month === month);
    if (existing) {
      existing.pnl += trade.pnl;
      existing.trades += 1;
    } else {
      acc.push({ month, pnl: trade.pnl, trades: 1 });
    }
    return acc;
  }, [] as Array<{ month: string; pnl: number; trades: number }>);

  // Get most traded symbols
  const symbolStats = trades.reduce((acc, trade) => {
    if (!acc[trade.symbol]) {
      acc[trade.symbol] = { count: 0, pnl: 0, wins: 0, losses: 0 };
    }
    acc[trade.symbol].count += 1;
    acc[trade.symbol].pnl += trade.pnl;
    if (trade.outcome === 'win') acc[trade.symbol].wins += 1;
    if (trade.outcome === 'loss') acc[trade.symbol].losses += 1;
    return acc;
  }, {} as Record<string, { count: number; pnl: number; wins: number; losses: number }>);

  const topSymbols = Object.entries(symbolStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  const chart = {
    primary: 'var(--chart-1)',
    destructive: 'var(--destructive)',
    muted: 'var(--muted-foreground)',
    grid: 'var(--border)',
  };

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
                {trades.length} trades
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
        ) : trades.length === 0 ? (
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
                <div className={`mt-2 text-2xl font-semibold tabular-nums ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totalPnL)}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Win Rate</span>
                  <Percent className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{winRate.toFixed(1)}%</div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {wins.length}W / {losses.length}L
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg P&L</span>
                  <Target className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className={`mt-2 text-2xl font-semibold tabular-nums ${averagePnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(averagePnL)}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Profit Factor</span>
                  <Activity className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  {profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
                </div>
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
                    <CartesianGrid stroke={chart.grid} strokeDasharray="4 4" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ backgroundColor: 'var(--card)' }}
                    />
                    <Line type="monotone" dataKey="equity" stroke={chart.primary} strokeWidth={2} dot={false} />
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
                      <div className={`text-sm font-semibold tabular-nums ${stats.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
                        data={outcomeData.map((d) => ({ ...d, color: undefined }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={90}
                        dataKey="value"
                      >
                        {outcomeData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.name === 'Wins'
                                ? chart.primary
                                : entry.name === 'Losses'
                                  ? chart.destructive
                                  : chart.muted
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'var(--card)' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
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
                      <CartesianGrid stroke={chart.grid} strokeDasharray="4 4" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ backgroundColor: 'var(--card)' }}
                      />
                      <Bar dataKey="pnl" fill={chart.primary} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg Win</span>
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums text-green-600">{formatCurrency(averageWin)}</div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg Loss</span>
                  <TrendingDown className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums text-red-600">{formatCurrency(averageLoss)}</div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Long</span>
                  <Badge variant="secondary" className="tabular-nums">{longTrades.length}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground tabular-nums">
                  Win Rate: {calculateWinRate(longTrades).toFixed(1)}%
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Short</span>
                  <Badge variant="secondary" className="tabular-nums">{shortTrades.length}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground tabular-nums">
                  Win Rate: {calculateWinRate(shortTrades).toFixed(1)}%
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
