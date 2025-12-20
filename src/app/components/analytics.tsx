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
  formatPercentage,
} from '../utils/trade-calculations';
import type { Trade } from '../types/trade';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Target, DollarSign, Percent, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { getFeatureAccess, requestUpgrade } from '../utils/feature-access';
import { useProfile } from '../utils/use-profile';

export function Analytics() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const { plan, isActive } = useProfile();
  const effectivePlan = isActive ? plan : 'free';
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

    let autoSyncInterval: number | null = null;

    const readMtConnection = () => {
      try {
        const raw = localStorage.getItem('mt-connection');
        if (!raw) return null;
        return JSON.parse(raw) as { autoSync?: unknown; method?: unknown };
      } catch {
        // ignore
      }
      return null;
    };

    const readAutoSyncEnabled = () => {
      const parsed = readMtConnection();
      if (typeof parsed?.autoSync === 'boolean') return parsed.autoSync;
      return localStorage.getItem('mt-auto-sync') === 'true';
    };

      const updateAutoSync = (runOnce = false) => {
        if (autoSyncInterval) {
          window.clearInterval(autoSyncInterval);
          autoSyncInterval = null;
        }

      const enabled = readAutoSyncEnabled();
      if (!enabled) return;

      const tick = async () => {
        await refreshTrades();
      };

      autoSyncInterval = window.setInterval(() => {
        void tick();
      }, 5 * 60 * 1000);

      if (runOnce) void tick();
    };

    updateAutoSync(true);

    const handleMtConnectionChanged = () => {
      const enabled = readAutoSyncEnabled();
      updateAutoSync(true);
      if (!enabled) void refreshTrades();
    };

    window.addEventListener('mt-connection-changed', handleMtConnectionChanged);

    return () => {
      window.removeEventListener('subscription-changed', handleSubscriptionChanged);
      window.removeEventListener('mt-connection-changed', handleMtConnectionChanged);
      if (autoSyncInterval) window.clearInterval(autoSyncInterval);
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

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl mb-2">Analytics</h1>
          <p className="text-muted-foreground">Analyze your trading performance</p>
        </div>

        {!access.advanced_analytics ? (
          <Card className="p-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl mb-1">Advanced analytics are a Pro feature</h2>
                <p className="text-sm text-muted-foreground">
                  Upgrade to Pro to unlock imports, MT4/MT5 sync, and deeper analytics.
                </p>
              </div>
              <Button onClick={() => requestUpgrade('advanced_analytics')} className="bg-[#34a85a] hover:bg-[#2d9450]">
                Upgrade to Pro
              </Button>
            </div>
          </Card>
        ) : trades.length === 0 ? (
          <Card className="p-12 text-center">
            <Activity className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-2">No trading data yet</p>
            <p className="text-sm text-muted-foreground">Start adding trades to see your analytics</p>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground">Total P&L</span>
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
                <div className="text-2xl">{winRate.toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {wins.length}W / {losses.length}L
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground">Avg P&L</span>
                  <Target className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className={`text-2xl ${averagePnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(averagePnL)}
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground">Profit Factor</span>
                  <Activity className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="text-2xl">
                  {profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg">Broker Metrics</h2>
                  <p className="text-sm text-muted-foreground">Coming soon</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Broker metrics integration will be added in a future update. Your analytics above are based on the
                trades already stored in your journal.
              </p>
            </Card>

            {/* Additional Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground">Avg Win</span>
                  <TrendingUp className="w-4 h-4 text-green-600" />
                </div>
                <div className="text-xl text-green-600">{formatCurrency(averageWin)}</div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground">Avg Loss</span>
                  <TrendingDown className="w-4 h-4 text-red-600" />
                </div>
                <div className="text-xl text-red-600">{formatCurrency(averageLoss)}</div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground">Long Trades</span>
                </div>
                <div className="text-xl">{longTrades.length}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Win Rate: {calculateWinRate(longTrades).toFixed(1)}%
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground">Short Trades</span>
                </div>
                <div className="text-xl">{shortTrades.length}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Win Rate: {calculateWinRate(shortTrades).toFixed(1)}%
                </div>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Equity Curve */}
              <Card className="p-6">
                <h2 className="mb-4">Equity Curve</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={equityCurveData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))' }}
                    />
                    <Line type="monotone" dataKey="equity" stroke="#3b82f6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              {/* Win/Loss Distribution */}
              <Card className="p-6">
                <h2 className="mb-4">Win/Loss Distribution</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={outcomeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {outcomeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))' }} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              {/* Monthly Performance */}
              {monthlyData.length > 0 && (
                <Card className="p-6">
                  <h2 className="mb-4">Monthly Performance</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))' }}
                      />
                      <Bar dataKey="pnl" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Top Symbols */}
              <Card className="p-6">
                <h2 className="mb-4">Most Traded Symbols</h2>
                <div className="space-y-3">
                  {topSymbols.map(([symbol, stats]) => (
                    <div key={symbol} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="font-medium">{symbol}</div>
                        <Badge variant="secondary">{stats.count} trades</Badge>
                      </div>
                      <div className="text-right">
                        <div className={`font-medium ${stats.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(stats.pnl)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {stats.wins}W / {stats.losses}L
                        </div>
                      </div>
                    </div>
                  ))}
                  {topSymbols.length === 0 && (
                    <p className="text-muted-foreground text-center py-4">No data available</p>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
