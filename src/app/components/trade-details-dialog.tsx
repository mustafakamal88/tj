import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import type { Trade } from '../types/trade';
import { format } from 'date-fns';
import { formatCurrency, formatPercentage } from '../utils/trade-calculations';

interface TradeDetailsDialogProps {
  trade: Trade;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TradeDetailsDialog({ trade, open, onOpenChange }: TradeDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{trade.symbol}</span>
            <Badge variant={trade.type === 'long' ? 'default' : 'secondary'}>
              {trade.type.toUpperCase()}
            </Badge>
            <Badge
              variant={
                trade.outcome === 'win'
                  ? 'default'
                  : trade.outcome === 'loss'
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {trade.outcome}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Date */}
          <div>
            <h3 className="text-sm text-muted-foreground mb-1">Date</h3>
            <p>{format(new Date(trade.date), 'MMMM dd, yyyy')}</p>
          </div>

          <Separator />

          {/* Trade Details */}
          <div>
            <h3 className="mb-3">Trade Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Entry Price</span>
                <p className="font-medium">${trade.entry.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Exit Price</span>
                <p className="font-medium">${trade.exit.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Quantity</span>
                <p className="font-medium">{trade.quantity}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Type</span>
                <p className="font-medium capitalize">{trade.type}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Performance */}
          <div>
            <h3 className="mb-3">Performance</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Profit/Loss</span>
                <p className={`text-lg font-medium ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(trade.pnl)}
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">P&L Percentage</span>
                <p className={`text-lg font-medium ${trade.pnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercentage(trade.pnlPercentage)}
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Outcome</span>
                <p className="font-medium capitalize">{trade.outcome}</p>
              </div>
            </div>
          </div>

          {/* Setup */}
          {trade.setup && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2">Trade Setup</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">{trade.setup}</p>
              </div>
            </>
          )}

          {/* Notes */}
          {trade.notes && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2">Notes</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">{trade.notes}</p>
              </div>
            </>
          )}

          {/* Emotions */}
          {trade.emotions && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2">Emotions & Psychology</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">{trade.emotions}</p>
              </div>
            </>
          )}

          {/* Mistakes */}
          {trade.mistakes && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2">Mistakes & Lessons</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">{trade.mistakes}</p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
