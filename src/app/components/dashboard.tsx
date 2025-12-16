import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Plus, ChevronLeft, ChevronRight, DollarSign, Percent, TrendingUp, TrendingDown, Upload, Settings } from 'lucide-react';
import { loadTrades } from '../utils/local-storage';
import { calculateWinRate, calculateTotalPnL, formatCurrency } from '../utils/trade-calculations';
import { filterTradesForFreeUser } from '../utils/data-limit';
import type { Trade } from '../types/trade';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay,
  getDay,
  addMonths,
  subMonths
} from 'date-fns';
import { AddTradeDialog } from './add-trade-dialog';
import { MTImportDialog } from './mt-import-dialog';
import { MTConnectionDialog } from './mt-connection-dialog';

export function Dashboard() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);

  useEffect(() => {
    const allTrades = loadTrades();
    // Apply 2-week limit for free users
    // In production, check user subscription status
    const userSubscription = localStorage.getItem('user-subscription') || 'free';
    const filteredTrades = userSubscription === 'free' ? filterTradesForFreeUser(allTrades) : allTrades;
    setTrades(filteredTrades);
  }, []);

  const refreshTrades = () => {
    const allTrades = loadTrades();
    const userSubscription = localStorage.getItem('user-subscription') || 'free';
    const filteredTrades = userSubscription === 'free' ? filterTradesForFreeUser(allTrades) : allTrades;
    setTrades(filteredTrades);
  };

  // Get trades for current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const currentMonthTrades = trades.filter(trade => {
    const tradeDate = new Date(trade.date);
    return tradeDate >= monthStart && tradeDate <= monthEnd;
  });

  // Calculate statistics
  const totalPnL = calculateTotalPnL(currentMonthTrades);
  const winRate = calculateWinRate(currentMonthTrades);
  const totalTrades = currentMonthTrades.length;
  const wins = currentMonthTrades.filter(t => t.outcome === 'win').length;
  const losses = currentMonthTrades.filter(t => t.outcome === 'loss').length;

  // Get all days in the current month
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Group days by week
  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];
  
  // Add empty cells for days before the month starts
  const firstDayOfWeek = getDay(monthStart);
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push(new Date(0)); // Placeholder for empty cell
  }

  monthDays.forEach((day, index) => {
    currentWeek.push(day);
    
    if (getDay(day) === 6 || index === monthDays.length - 1) {
      // End of week (Saturday) or end of month
      weeks.push([...currentWeek]);
      currentWeek = [];
    }
  });

  // Calculate trade data for each day
  const getDayData = (day: Date) => {
    if (day.getTime() === 0) return null; // Empty cell
    
    const dayTrades = trades.filter(trade => isSameDay(new Date(trade.date), day));
    const totalPnL = dayTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    
    return {
      trades: dayTrades,
      count: dayTrades.length,
      pnl: totalPnL,
      isClosed: dayTrades.length === 0
    };
  };

  // Calculate weekly totals
  const getWeekData = (week: Date[]) => {
    const validDays = week.filter(d => d.getTime() !== 0);
    const weekTrades = validDays.flatMap(day => 
      trades.filter(trade => isSameDay(new Date(trade.date), day))
    );
    const totalPnL = weekTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    const tradingDays = validDays.filter(day => {
      const dayTrades = trades.filter(trade => isSameDay(new Date(trade.date), day));
      return dayTrades.length > 0;
    }).length;
    
    return {
      pnl: totalPnL,
      days: tradingDays
    };
  };

  const isToday = (day: Date) => {
    if (day.getTime() === 0) return false;
    return isSameDay(day, new Date());
  };

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
            <Button variant="outline" onClick={() => setIsConnectionDialogOpen(true)} className="gap-2">
              <Settings className="w-4 h-4" />
              MT4/MT5 Sync
            </Button>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} className="gap-2">
              <Upload className="w-4 h-4" />
              Import
            </Button>
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Trade
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground">Total P&L (Month)</span>
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
              <span className="text-green-600">{wins}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-red-600">{losses}</span>
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

        {/* Calendar Card */}
        <Card className="p-6">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">TODAY</span>
              <span className="text-muted-foreground">-</span>
              <h2>{format(currentMonth, 'MMMM yyyy')}</h2>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Day Headers */}
              <div className="grid grid-cols-8 gap-0 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Week'].map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm text-muted-foreground py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Rows */}
              <div className="border rounded-lg overflow-hidden">
                {weeks.map((week, weekIndex) => {
                  const weekData = getWeekData(week);
                  return (
                    <div
                      key={weekIndex}
                      className="grid grid-cols-8 gap-0"
                      style={{ gridTemplateColumns: 'repeat(7, 1fr) 120px' }}
                    >
                      {/* Day Cells */}
                      {week.map((day, dayIndex) => {
                        const dayData = getDayData(day);
                        const isEmpty = day.getTime() === 0;
                        
                        return (
                          <div
                            key={dayIndex}
                            className={`
                              border-b border-r p-4 min-h-[100px] flex flex-col
                              ${isEmpty ? 'bg-muted/20' : ''}
                              ${isToday(day) ? 'bg-blue-50 dark:bg-blue-950/20' : ''}
                              ${dayData && !dayData.isClosed ? 'hover:bg-accent cursor-pointer' : ''}
                            `}
                          >
                            {!isEmpty && (
                              <>
                                {/* Date */}
                                <div className="text-sm text-muted-foreground mb-2">
                                  {format(day, 'd')}
                                </div>

                                {/* P&L */}
                                <div className="flex-1 flex items-center justify-center">
                                  {dayData?.isClosed ? (
                                    <span className="text-2xl text-muted-foreground">—</span>
                                  ) : (
                                    <span
                                      className={`text-xl font-medium ${
                                        dayData && dayData.pnl >= 0
                                          ? 'text-green-600'
                                          : 'text-red-600'
                                      }`}
                                    >
                                      {dayData && formatCurrency(dayData.pnl).replace('.00', '')}
                                    </span>
                                  )}
                                </div>

                                {/* Trade Count */}
                                <div className="text-xs text-center text-muted-foreground mt-2">
                                  {dayData?.isClosed ? (
                                    'Closed'
                                  ) : (
                                    <>
                                      {dayData?.count} {dayData?.count === 1 ? 'trade' : 'trades'}
                                    </>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}

                      {/* Week Summary Cell */}
                      <div className="border-b p-4 min-h-[100px] flex flex-col items-center justify-center bg-muted/30">
                        <div className="text-sm text-muted-foreground mb-2">
                          Week {weekIndex + 1}
                        </div>
                        {weekData.days > 0 ? (
                          <>
                            <div
                              className={`text-xl font-medium ${
                                weekData.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {formatCurrency(weekData.pnl).replace('.00', '')}
                            </div>
                            <div className="text-xs text-muted-foreground mt-2">
                              {weekData.days} {weekData.days === 1 ? 'day' : 'days'}
                            </div>
                          </>
                        ) : (
                          <span className="text-xl text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-600"></div>
              <span>Profit</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-600"></div>
              <span>Loss</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border-2"></div>
              <span>Closed</span>
            </div>
          </div>
        </Card>

        {/* Empty State */}
        {trades.length === 0 && (
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

      <MTConnectionDialog
        open={isConnectionDialogOpen}
        onOpenChange={setIsConnectionDialogOpen}
      />
    </div>
  );
}