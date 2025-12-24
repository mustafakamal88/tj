import { useEffect, useMemo, useState } from 'react';
import type { Trade } from '../types/trade';
import { fetchTrades } from '../utils/trades-api';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { formatCurrency } from '../utils/trade-calculations';
import { useProfile } from '../utils/use-profile';
import { getEffectivePlan } from '../utils/entitlements';
import { filterTradesForFreeUser } from '../utils/data-limit';
import { JournalTradeDrawer } from '../components/journal-trade-drawer';

type SymbolSummary = {
  symbol: string;
  trades: Trade[];
  tradeCount: number;
  totalPnl: number;
  winRate: number | null;
};

export function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [tradeDrawerOpen, setTradeDrawerOpen] = useState(false);
  const { profile } = useProfile();
  const effectivePlan = getEffectivePlan(profile);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const allTrades = await fetchTrades();
      const visible = effectivePlan === 'free' ? filterTradesForFreeUser(allTrades) : allTrades;
      if (cancelled) return;
      setTrades(visible);
    })();

    return () => {
      cancelled = true;
    };
  }, [effectivePlan]);

  const grouped = useMemo<SymbolSummary[]>(() => {
    const map = new Map<string, Trade[]>();
    for (const t of trades) {
      const key = (t.symbol || '').trim() || '—';
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }

    const summaries: SymbolSummary[] = [];

    for (const [symbol, groupTrades] of map.entries()) {
      const totalPnl = groupTrades.reduce((sum, t) => sum + (typeof t.pnl === 'number' ? t.pnl : 0), 0);
      const winCount = groupTrades.filter((t) => t.outcome === 'win').length;
      const lossCount = groupTrades.filter((t) => t.outcome === 'loss').length;
      const finishedCount = winCount + lossCount;
      const winRate = finishedCount > 0 ? (winCount / finishedCount) * 100 : null;

      summaries.push({
        symbol,
        trades: [...groupTrades].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        tradeCount: groupTrades.length,
        totalPnl,
        winRate,
      });
    }

    summaries.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return summaries;
  }, [trades]);

  const handleOpenTrade = (id: string) => {
    setSelectedTradeId(id);
    setTradeDrawerOpen(true);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl mb-2">Journal</h1>
          <p className="text-muted-foreground">Trades grouped by symbol</p>
        </div>

        <JournalTradeDrawer
          open={tradeDrawerOpen}
          tradeId={selectedTradeId}
          onOpenChange={(next) => {
            setTradeDrawerOpen(next);
            if (!next) setSelectedTradeId(null);
          }}
        />

        {grouped.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">No trades yet</Card>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => {
              const pnlPositive = group.totalPnl >= 0;

              return (
                <Card key={group.symbol} className="p-0 overflow-hidden">
                  <div className="px-6 py-4 border-b bg-muted/30">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-xl font-semibold">{group.symbol}</h2>
                          <Badge variant="outline">{group.tradeCount} trades</Badge>
                          <Badge variant={pnlPositive ? 'default' : 'destructive'}>
                            Total P/L: {formatCurrency(group.totalPnl)}
                          </Badge>
                          {group.winRate !== null ? (
                            <Badge variant="outline">WR: {group.winRate.toFixed(0)}%</Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-border">
                    {group.trades.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="px-6 py-4 w-full text-left hover:bg-muted/40"
                        onClick={() => handleOpenTrade(t.id)}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-muted-foreground">{t.date}</span>
                              <Badge variant={t.type === 'long' ? 'default' : 'secondary'} className="text-xs">
                                {t.type.toUpperCase()}
                              </Badge>
                              <Badge
                                variant={
                                  t.outcome === 'win'
                                    ? 'default'
                                    : t.outcome === 'loss'
                                    ? 'destructive'
                                    : 'secondary'
                                }
                                className="text-xs"
                              >
                                {t.outcome}
                              </Badge>
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              Entry: <span className="font-mono text-foreground">{t.entry}</span> · Exit:{' '}
                              <span className="font-mono text-foreground">{t.exit}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className={pnlPositive ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                              {formatCurrency(t.pnl)}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
