import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Search, Filter, Trash2, Eye, Upload } from 'lucide-react';
import { deleteTrade, fetchTrades } from '../utils/trades-api';
import { formatCurrency, formatPercentage } from '../utils/trade-calculations';
import { filterTradesForFreeUser } from '../utils/data-limit';
import { getFeatureAccess, requestUpgrade } from '../utils/feature-access';
import { useProfile } from '../utils/use-profile';
import { getEffectivePlan, hasPaidEntitlement } from '../utils/entitlements';
import type { Trade } from '../types/trade';
import { format } from 'date-fns';
import { AddTradeDialog } from './add-trade-dialog';
import { MTImportDialog } from './mt-import-dialog';
import { TradeDetailsDialog } from './trade-details-dialog';
import { toast } from 'sonner';
import { pnlTextClass, semanticColors } from '../utils/semantic-colors';

export function TradeJournal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'long' | 'short'>('all');
  const [filterOutcome, setFilterOutcome] = useState<'all' | 'win' | 'loss' | 'breakeven'>('all');
  const { profile, loading: profileLoading, refresh: refreshProfile } = useProfile();
  const effectivePlan = getEffectivePlan(profile);

  const refreshTrades = async () => {
    const allTrades = await fetchTrades();
    const filteredTrades = effectivePlan === 'free' ? filterTradesForFreeUser(allTrades) : allTrades;
    setTrades(filteredTrades);
  };

  const access = getFeatureAccess(effectivePlan);

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

  const handleDeleteTrade = async (tradeId: string, symbol: string) => {
    if (window.confirm(`Are you sure you want to delete the trade for ${symbol}?`)) {
      const ok = await deleteTrade(tradeId);
      if (!ok) {
        toast.error('Failed to delete trade');
        return;
      }
      toast.success('Trade deleted successfully');
      void refreshTrades();
    }
  };

  // Filter trades
  const filteredTrades = trades
    .filter(trade => {
      const matchesSearch = trade.symbol.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'all' || trade.type === filterType;
      const matchesOutcome = filterOutcome === 'all' || trade.outcome === filterOutcome;
      return matchesSearch && matchesType && matchesOutcome;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl mb-2">Trade Journal</h1>
            <p className="text-muted-foreground">View and manage all your trades</p>
          </div>
          <div className="flex gap-2">
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

        {/* Filters */}
        <Card className="p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <SelectValue placeholder="Trade Type" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="long">Long</SelectItem>
                <SelectItem value="short">Short</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterOutcome} onValueChange={(value: any) => setFilterOutcome(value)}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <SelectValue placeholder="Outcome" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outcomes</SelectItem>
                <SelectItem value="win">Wins</SelectItem>
                <SelectItem value="loss">Losses</SelectItem>
                <SelectItem value="breakeven">Breakeven</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {filteredTrades.length} {filteredTrades.length === 1 ? 'trade' : 'trades'}
              </span>
            </div>
          </div>
        </Card>

        {/* Trades List */}
        <div className="space-y-4">
          {filteredTrades.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="text-muted-foreground">
                {trades.length === 0 ? (
                  <>
                    <p className="mb-2">No trades yet</p>
                    <p className="text-sm mb-4">Start by adding your first trade!</p>
                    <Button onClick={() => setIsAddDialogOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Your First Trade
                    </Button>
                  </>
                ) : (
                  <p>No trades match your filters</p>
                )}
              </div>
            </Card>
          ) : (
            filteredTrades.map(trade => (
              <Card key={trade.id} className="p-6 hover:shadow-md transition-shadow">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Trade Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="text-lg">{trade.symbol}</h3>
                      <Badge
                        variant="outline"
                        className={trade.type === 'long' ? semanticColors.longChipClasses : semanticColors.shortChipClasses}
                      >
                        {trade.type.toUpperCase()}
                      </Badge>
                      <Badge
                        variant={trade.outcome === 'breakeven' ? 'secondary' : 'outline'}
                        className={
                          trade.outcome === 'win'
                            ? semanticColors.winChipClasses
                            : trade.outcome === 'loss'
                              ? semanticColors.lossChipClasses
                              : undefined
                        }
                      >
                        {trade.outcome}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(trade.date), 'MMM dd, yyyy')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-muted-foreground">Entry:</span>{' '}
                        <span className="font-medium">${trade.entry.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Exit:</span>{' '}
                        <span className="font-medium">${trade.exit.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Quantity:</span>{' '}
                        <span className="font-medium">{trade.quantity}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">P&L:</span>{' '}
                        <span className={`font-medium ${pnlTextClass(trade.pnl)}`}>
                          {formatCurrency(trade.pnl)}
                        </span>
                      </div>
                    </div>

                    {trade.notes && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{trade.notes}</p>
                    )}
                  </div>

                  {/* P&L and Actions */}
                  <div className="flex items-center gap-4 lg:flex-col lg:items-end">
                    <div className="text-right">
                      <div className={`text-xl font-medium ${pnlTextClass(trade.pnl)}`}>
                        {formatCurrency(trade.pnl)}
                      </div>
                      <div className={`text-sm ${pnlTextClass(trade.pnlPercentage)}`}>
                        {formatPercentage(trade.pnlPercentage)}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTrade(trade)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteTrade(trade.id, trade.symbol)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
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

      {selectedTrade && (
        <TradeDetailsDialog
          trade={selectedTrade}
          open={!!selectedTrade}
          onOpenChange={(open) => !open && setSelectedTrade(null)}
        />
      )}
    </div>
  );
}
