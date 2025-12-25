import { useMemo, useState, useEffect, useRef } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Plus, DollarSign, Percent, TrendingUp, TrendingDown, Upload, Link } from 'lucide-react';
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
  addMonths,
} from 'date-fns';
import { AddTradeDialog } from './add-trade-dialog';
import { MTImportDialog } from './mt-import-dialog';
import { BrokerConnectionDialog } from './broker-connection-dialog';
import { JudgmentCard } from './judgment-card';
import { computeJudgment } from '../utils/judgment';
export function Dashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalTradeCount, setTotalTradeCount] = useState(0);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isBrokerDialogOpen, setIsBrokerDialogOpen] = useState(false);
  const { profile, loading: profileLoading, refresh: refreshProfile } = useProfile();
  const effectivePlan = getEffectivePlan(profile);
  const paidActiveRef = useRef(false);
  const handledReturnRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);
  const [judgmentUpdatedAt, setJudgmentUpdatedAt] = useState<Date>(() => new Date());

  useEffect(() => {
    paidActiveRef.current = hasPaidEntitlement(profile);
  }, [profile]);

  const refreshTrades = async () => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = startOfMonth(addMonths(now, 1));
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
  }, [effectivePlan]);

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

  useEffect(() => {
    setJudgmentUpdatedAt(new Date());
  }, [trades]);
  // Calculate statistics
  const totalPnL = useMemo(() => calculateTotalPnL(trades), [trades]);
  const winRate = useMemo(() => calculateWinRate(trades), [trades]);
  const totalTrades = trades.length;
  const wins = useMemo(() => trades.filter((t) => t.outcome === 'win').length, [trades]);
  const losses = useMemo(
    () => trades.filter((t) => t.outcome === 'loss').length,
    [trades],
  );

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

  const todayKey = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const todayStat = dayStats.get(todayKey);
  const tradesToday = todayStat?.count ?? 0;
  const todayPnL = todayStat?.pnl ?? 0;

  const recentTradesDesc = useMemo(() => {
    const toTime = (t: Trade) => {
      const time = t.closeTime || t.openTime || t.date;
      const ms = new Date(time).getTime();
      return Number.isFinite(ms) ? ms : 0;
    };
    return [...trades].sort((a, b) => toTime(b) - toTime(a));
  }, [trades]);

  const losingStreak = useMemo(() => {
    let streak = 0;
    for (const t of recentTradesDesc) {
      if (t.outcome === 'loss') {
        streak += 1;
        continue;
      }
      if (t.outcome === 'win') break;
    }
    return streak;
  }, [recentTradesDesc]);

  const extractRiskValue = (t: Trade): number | null => {
    const anyT = t as any;

    const candidates = [anyT?.riskUsd, anyT?.risk, anyT?.riskPct];
    for (const v of candidates) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    }

    if (
      typeof t.entry === 'number' &&
      Number.isFinite(t.entry) &&
      typeof t.stopLoss === 'number' &&
      Number.isFinite(t.stopLoss) &&
      typeof t.quantity === 'number' &&
      Number.isFinite(t.quantity) &&
      t.quantity > 0
    ) {
      const approx = Math.abs(t.entry - t.stopLoss) * t.quantity;
      if (Number.isFinite(approx) && approx > 0) return approx;
    }

    if (typeof t.size === 'number' && Number.isFinite(t.size) && t.size > 0) return t.size;
    return null;
  };

  const last10RiskValues = useMemo(() => {
    const values: number[] = [];
    for (const t of recentTradesDesc) {
      const v = extractRiskValue(t);
      if (v === null) continue;
      values.push(v);
      if (values.length >= 10) break;
    }
    return values.length >= 2 ? values : undefined;
  }, [recentTradesDesc]);

  const judgmentBreakdown = useMemo(() => {
    const rows = [] as Array<{
      id: 'trade_frequency' | 'risk_spike' | 'losing_streak' | 'daily_drawdown';
      label: string;
      status: 'green' | 'yellow' | 'red';
      valueText: string;
      thresholdText: string;
      missing?: boolean;
      tips?: string[];
    }>;

    const hasAnyTrades = totalTradeCount > 0;

    // Trades today
    const tradesTodayMissing = !hasAnyTrades;
    const tradesTodayValue = tradesTodayMissing ? null : tradesToday;
    const tradesTodayStatus: 'green' | 'yellow' | 'red' = tradesTodayMissing
      ? 'yellow'
      : tradesTodayValue >= 7
        ? 'red'
        : tradesTodayValue >= 4
          ? 'yellow'
          : 'green';
    rows.push({
      id: 'trade_frequency',
      label: 'Trades today',
      status: tradesTodayStatus,
      valueText: tradesTodayMissing ? '—' : String(tradesTodayValue),
      thresholdText: '0–3 / 4–6 / 7+',
      missing: tradesTodayMissing,
      tips: tradesTodayStatus === 'red'
        ? ['Stop for today after 7 trades.', 'Set a hard trade limit.']
        : tradesTodayStatus === 'yellow'
          ? ['Slow down and reduce frequency.']
          : undefined,
    });

    // Risk spike
    const riskMissing = !hasAnyTrades || !Array.isArray(last10RiskValues);
    let riskRatio: number | null = null;
    if (!riskMissing) {
      const cleaned = last10RiskValues.filter((v) => Number.isFinite(v) && v > 0);
      if (cleaned.length >= 2) {
        const avg = cleaned.reduce((s, v) => s + v, 0) / cleaned.length;
        const max = Math.max(...cleaned);
        const ratio = avg > 0 ? max / avg : NaN;
        riskRatio = Number.isFinite(ratio) ? ratio : null;
      }
    }

    const riskStatus: 'green' | 'yellow' | 'red' = riskMissing || riskRatio === null
      ? 'yellow'
      : riskRatio > 2.0
        ? 'red'
        : riskRatio > 1.5
          ? 'yellow'
          : 'green';

    rows.push({
      id: 'risk_spike',
      label: 'Risk spike',
      status: riskStatus,
      valueText: riskMissing || riskRatio === null ? '—' : `${riskRatio.toFixed(2)}×`,
      thresholdText: '≤1.5× / 1.5–2.0× / >2.0×',
      missing: riskMissing || riskRatio === null,
      tips: riskStatus === 'red'
        ? ['Cut size back to baseline.', 'Avoid revenge-sizing.']
        : riskStatus === 'yellow'
          ? ['Keep risk consistent trade-to-trade.']
          : undefined,
    });

    // Losing streak
    const losingStreakMissing = !hasAnyTrades;
    const streakValue = losingStreakMissing ? null : losingStreak;
    const streakStatus: 'green' | 'yellow' | 'red' = losingStreakMissing
      ? 'yellow'
      : streakValue >= 4
        ? 'red'
        : streakValue === 3
          ? 'yellow'
          : 'green';

    rows.push({
      id: 'losing_streak',
      label: 'Losing streak',
      status: streakStatus,
      valueText: losingStreakMissing ? '—' : String(streakValue),
      thresholdText: '0–2 / 3 / 4+',
      missing: losingStreakMissing,
      tips: streakStatus === 'red'
        ? ['Pause or trade micro-size.', 'Tighten your A+ criteria.']
        : streakStatus === 'yellow'
          ? ['Reduce risk until you reset.']
          : undefined,
    });

    // Daily drawdown
    const maxLoss = 200;
    const drawdownMissing = !hasAnyTrades;
    const ddPct = drawdownMissing ? null : Math.abs(Math.min(0, todayPnL)) / maxLoss;
    const ddStatus: 'green' | 'yellow' | 'red' = drawdownMissing || ddPct === null
      ? 'yellow'
      : ddPct > 0.7
        ? 'red'
        : ddPct >= 0.4
          ? 'yellow'
          : 'green';

    rows.push({
      id: 'daily_drawdown',
      label: 'Daily drawdown',
      status: ddStatus,
      valueText: drawdownMissing || ddPct === null ? '—' : `${Math.round(ddPct * 100)}%`,
      thresholdText: '<40% / 40–70% / >70%',
      missing: drawdownMissing || ddPct === null,
      tips: ddStatus === 'red'
        ? ['Stop trading for today.', 'Review journal before next session.']
        : ddStatus === 'yellow'
          ? ['Trade smaller or pause.']
          : undefined,
    });

    const signalsPresent = rows.filter((r) => !r.missing).length;
    const confidence: 'High' | 'Medium' | 'Low' =
      signalsPresent >= 3 ? 'High' : signalsPresent === 2 ? 'Medium' : 'Low';
    const showAccuracyHint = confidence !== 'High';

    const rank = (s: 'green' | 'yellow' | 'red') => (s === 'red' ? 3 : s === 'yellow' ? 2 : 1);
    const worstRow = rows.reduce((acc, cur) => (rank(cur.status) > rank(acc.status) ? cur : acc), rows[0]);

    return {
      rows,
      signalsPresent,
      confidence,
      showAccuracyHint,
      worstRowId: worstRow.id,
    };
  }, [totalTradeCount, tradesToday, todayPnL, losingStreak, last10RiskValues]);

  const judgmentResult = useMemo(() => {
    // If there are no trades at all, don't penalize: show a neutral green state.
    if (totalTradeCount === 0) {
      return computeJudgment({});
    }

    return computeJudgment({
      tradesToday,
      last10RiskValues,
      losingStreak,
      todayPnL,
      dailyMaxLoss: 200,
    });
  }, [totalTradeCount, tradesToday, last10RiskValues, losingStreak, todayPnL]);

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

        {/* Top row */}
        <div className="grid gap-4 lg:grid-cols-12 mb-8">
          <JudgmentCard
            result={judgmentResult}
            breakdown={judgmentBreakdown}
            updatedAt={judgmentUpdatedAt}
            className="lg:col-span-7"
          />

          <div className="lg:col-span-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>
        </div>

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
