import { useEffect, useMemo, useState } from 'react';
import type { Trade } from '../types/trade';
import { fetchTrades } from '../utils/trades-api';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { formatCurrency } from '../utils/trade-calculations';
import { useProfile } from '../utils/use-profile';
import { getEffectivePlan } from '../utils/entitlements';
import { filterTradesForFreeUser } from '../utils/data-limit';
import { JournalTradeDrawer } from '../components/journal-trade-drawer';
import { ChevronDown, ChevronRight } from 'lucide-react';

type SymbolSummary = {
  symbol: string;
  trades: Trade[];
  tradeCount: number;
  totalPnl: number;
  winRate: number | null;
};

type TradeSourceGroup = 'all' | 'imported' | 'manual';
type TradeSort = 'time_desc' | 'time_asc' | 'pnl_desc' | 'pnl_asc';

function isImportedTrade(t: Trade): boolean {
  return Boolean(
    t.ticket ||
      t.positionId ||
      t.accountLogin ||
      t.openTime ||
      t.closeTime
  );
}

export function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [tradeDrawerOpen, setTradeDrawerOpen] = useState(false);
  const [symbolQuery, setSymbolQuery] = useState('');
  const [expandedSymbols, setExpandedSymbols] = useState<string[]>([]);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<TradeSourceGroup>('all');
  const [sort, setSort] = useState<TradeSort>('time_desc');
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

  const folders = useMemo(() => {
    const map = new Map<string, Trade[]>();
    for (const t of trades) {
      const key = (t.symbol || '').trim() || '—';
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }

    const items = [...map.entries()].map(([symbol, groupTrades]) => {
      const imported = groupTrades.filter(isImportedTrade);
      const manual = groupTrades.filter((t) => !isImportedTrade(t));
      const totalPnl = groupTrades.reduce((sum, t) => sum + (typeof t.pnl === 'number' ? t.pnl : 0), 0);
      return {
        symbol,
        trades: groupTrades,
        imported,
        manual,
        tradeCount: groupTrades.length,
        totalPnl,
      };
    });

    items.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return items;
  }, [trades]);

  const filteredFolders = useMemo(() => {
    const q = symbolQuery.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => f.symbol.toLowerCase().includes(q));
  }, [folders, symbolQuery]);

  useEffect(() => {
    if (activeSymbol) return;
    if (filteredFolders.length === 0) return;
    const first = filteredFolders[0].symbol;
    setActiveSymbol(first);
    setExpandedSymbols((prev) => (prev.includes(first) ? prev : [first, ...prev]));
    setActiveGroup('all');
  }, [activeSymbol, filteredFolders]);

  const activeFolder = useMemo(() => {
    if (!activeSymbol) return null;
    return folders.find((f) => f.symbol === activeSymbol) ?? null;
  }, [folders, activeSymbol]);

  const activeTrades = useMemo(() => {
    if (!activeFolder) return [];
    const base =
      activeGroup === 'imported'
        ? activeFolder.imported
        : activeGroup === 'manual'
        ? activeFolder.manual
        : activeFolder.trades;

    const toTime = (t: Trade) => {
      const time = t.openTime || t.closeTime || t.date;
      const ms = new Date(time).getTime();
      return Number.isFinite(ms) ? ms : 0;
    };

    const sorted = [...base].sort((a, b) => {
      if (sort === 'pnl_desc') return (b.pnl ?? 0) - (a.pnl ?? 0);
      if (sort === 'pnl_asc') return (a.pnl ?? 0) - (b.pnl ?? 0);
      if (sort === 'time_asc') return toTime(a) - toTime(b);
      return toTime(b) - toTime(a);
    });

    return sorted;
  }, [activeFolder, activeGroup, sort]);

  const handleOpenTrade = (id: string) => {
    setSelectedTradeId(id);
    setTradeDrawerOpen(true);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl mb-2">Journal</h1>
          <p className="text-muted-foreground">Folders by symbol with fast trade review</p>
        </div>

        <JournalTradeDrawer
          open={tradeDrawerOpen}
          tradeId={selectedTradeId}
          onOpenChange={(next) => {
            setTradeDrawerOpen(next);
            if (!next) setSelectedTradeId(null);
          }}
        />

        {folders.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">No trades yet</Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            {/* Left: Symbol folders */}
            <Card className="p-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">Symbols</div>
                  <div className="text-xs text-muted-foreground">Single click toggles. Double click isolates.</div>
                </div>

                <Input
                  value={symbolQuery}
                  onChange={(e) => setSymbolQuery(e.target.value)}
                  placeholder="Search symbols…"
                  aria-label="Search symbols"
                />

                <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-1">
                  {filteredFolders.map((f) => {
                    const expanded = expandedSymbols.includes(f.symbol);
                    const isActive = activeSymbol === f.symbol;
                    const totalPositive = f.totalPnl >= 0;
                    const importedCount = f.imported.length;
                    const manualCount = f.manual.length;
                    const hasSourceSplit = importedCount > 0 && manualCount > 0;

                    return (
                      <div key={f.symbol} className="rounded-lg border">
                        <button
                          type="button"
                          className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                            isActive ? 'bg-accent' : 'hover:bg-accent'
                          }`}
                          onClick={() => {
                            setExpandedSymbols((prev) => {
                              const has = prev.includes(f.symbol);
                              const next = has ? prev.filter((s) => s !== f.symbol) : [f.symbol, ...prev];
                              return next;
                            });
                            setActiveSymbol(f.symbol);
                            setActiveGroup('all');
                          }}
                          onDoubleClick={() => {
                            setExpandedSymbols([f.symbol]);
                            setActiveSymbol(f.symbol);
                            setActiveGroup('all');
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold truncate">{f.symbol}</span>
                              <Badge variant="outline" className="text-[11px]">{f.tradeCount}</Badge>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              <span className={totalPositive ? 'text-foreground' : 'text-destructive'}>
                                {formatCurrency(f.totalPnl)}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0 text-muted-foreground">
                            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </div>
                        </button>

                        {expanded ? (
                          <div className="px-3 pb-3 pt-2 space-y-2">
                            {hasSourceSplit ? (
                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  variant={isActive && activeGroup === 'imported' ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => {
                                    setActiveSymbol(f.symbol);
                                    setActiveGroup('imported');
                                  }}
                                >
                                  Imported ({importedCount})
                                </Button>
                                <Button
                                  type="button"
                                  variant={isActive && activeGroup === 'manual' ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => {
                                    setActiveSymbol(f.symbol);
                                    setActiveGroup('manual');
                                  }}
                                >
                                  Manual ({manualCount})
                                </Button>
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">
                                {importedCount > 0 ? 'Imported trades' : manualCount > 0 ? 'Manual trades' : 'Trades'}
                              </div>
                            )}

                            <Button
                              type="button"
                              variant={isActive && activeGroup === 'all' ? 'default' : 'outline'}
                              size="sm"
                              className="w-full"
                              onClick={() => {
                                setActiveSymbol(f.symbol);
                                setActiveGroup('all');
                              }}
                            >
                              View all
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Middle: Trade list */}
            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/30 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-semibold">{activeSymbol ?? 'Trades'}</div>
                    {activeFolder ? (
                      <Badge variant="outline" className="text-[11px]">{activeTrades.length} shown</Badge>
                    ) : null}
                    {activeGroup !== 'all' ? (
                      <Badge variant="outline" className="text-[11px]">{activeGroup}</Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">Click a trade to open the drawer</div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={sort.startsWith('time') ? 'default' : 'outline'}
                    onClick={() => setSort((s) => (s === 'time_desc' ? 'time_asc' : 'time_desc'))}
                  >
                    Time
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={sort.startsWith('pnl') ? 'default' : 'outline'}
                    onClick={() => setSort((s) => (s === 'pnl_desc' ? 'pnl_asc' : 'pnl_desc'))}
                  >
                    P/L
                  </Button>
                </div>
              </div>

              {activeTrades.length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground">No trades in this folder.</div>
              ) : (
                <div className="divide-y divide-border">
                  {activeTrades.map((t) => {
                    const imported = isImportedTrade(t);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`w-full text-left p-4 transition-colors ${
                          t.id === selectedTradeId ? 'bg-accent' : 'hover:bg-accent'
                        }`}
                        onClick={() => handleOpenTrade(t.id)}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-muted-foreground">
                                {t.openTime ? new Date(t.openTime).toLocaleString() : t.date}
                              </span>
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
                              {imported ? (
                                <Badge variant="outline" className="text-[11px]">Imported</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[11px]">Manual</Badge>
                              )}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              Entry: <span className="font-mono text-foreground">{t.entry}</span> · Exit:{' '}
                              <span className="font-mono text-foreground">{t.exit}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={
                                (typeof t.pnl === 'number' ? t.pnl : 0) >= 0
                                  ? 'text-foreground font-semibold'
                                  : 'text-destructive font-semibold'
                              }
                            >
                              {formatCurrency(t.pnl)}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
