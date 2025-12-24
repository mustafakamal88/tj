import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { pnlTextClass, semanticColors } from '../utils/semantic-colors';
import type { Trade } from '../types/trade';
import { format } from 'date-fns';
import { formatCurrency, formatPercentage } from '../utils/trade-calculations';
import { createTradeScreenshotSignedUrl } from '../utils/day-journal-api';

interface TradeDetailsDialogProps {
  trade: Trade;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TradeDetailsDialog({ trade, open, onOpenChange }: TradeDetailsDialogProps) {
  const screenshots = Array.isArray(trade.screenshots) ? trade.screenshots.filter(Boolean) : [];
  const [signedUrls, setSignedUrls] = useState<Record<string, { url: string; expiresAtMs: number }>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const metrics = useMemo(() => {
    const entry = trade.entry;
    const stopLoss = typeof trade.stopLoss === 'number' ? trade.stopLoss : null;
    const takeProfit = typeof trade.takeProfit === 'number' ? trade.takeProfit : null;
    const quantity = trade.quantity;

    const isLong = trade.type === 'long';

    const riskDistance =
      stopLoss === null ? null : isLong ? entry - stopLoss : stopLoss - entry;
    const rewardDistance =
      takeProfit === null ? null : isLong ? takeProfit - entry : entry - takeProfit;

    const riskDistanceOk = riskDistance !== null && Number.isFinite(riskDistance) && riskDistance > 0;
    const rewardDistanceOk = rewardDistance !== null && Number.isFinite(rewardDistance) && rewardDistance > 0;

    const plannedRR = riskDistanceOk && rewardDistanceOk ? rewardDistance! / riskDistance! : null;

    const riskAmount = riskDistanceOk ? riskDistance! * quantity : null;
    const rMultiple = riskAmount && riskAmount > 0 ? trade.pnl / riskAmount : null;

    return {
      riskDistance: riskDistanceOk ? riskDistance! : null,
      rewardDistance: rewardDistanceOk ? rewardDistance! : null,
      plannedRR: plannedRR && Number.isFinite(plannedRR) ? plannedRR : null,
      riskAmount: riskAmount && Number.isFinite(riskAmount) ? riskAmount : null,
      rMultiple: rMultiple && Number.isFinite(rMultiple) ? rMultiple : null,
    };
  }, [trade]);

  useEffect(() => {
    if (!open) return;
    if (!screenshots.length) return;

    let cancelled = false;

    (async () => {
      const now = Date.now();
      for (const path of screenshots) {
        const existing = signedUrls[path];
        if (existing && existing.expiresAtMs - now > 30_000) continue;

        const result = await createTradeScreenshotSignedUrl(path, 3600);

        if (cancelled) return;
        if (!result?.signedUrl) continue;

        setSignedUrls((prev) => ({
          ...prev,
          [path]: { url: result.signedUrl, expiresAtMs: result.expiresAtMs },
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, screenshots, signedUrls]);

  useEffect(() => {
    if (!open) setActiveIndex(null);
  }, [open]);

  const activePath = activeIndex === null ? null : screenshots[activeIndex] ?? null;
  const activeUrl = activePath ? signedUrls[activePath]?.url : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{trade.symbol}</span>
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
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Date */}
          <div>
            <h3 className="text-sm text-muted-foreground mb-1">Date</h3>
            <p>{format(new Date(trade.date), 'MMMM dd, yyyy')}</p>
          </div>

          <Separator />

          {/* Key Stats */}
          <div>
            <h3 className="mb-3">Key Stats</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">P&L</span>
                <p className={`font-medium ${pnlTextClass(trade.pnl)}`}>{formatCurrency(trade.pnl)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">P&L %</span>
                <p className={`font-medium ${pnlTextClass(trade.pnlPercentage)}`}>{formatPercentage(trade.pnlPercentage)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Planned RR</span>
                <p className="font-medium">{metrics.plannedRR === null ? '—' : metrics.plannedRR.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">R Multiple</span>
                <p className="font-medium">{metrics.rMultiple === null ? '—' : metrics.rMultiple.toFixed(2)}</p>
              </div>
            </div>
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
                <span className="text-sm text-muted-foreground">Stop Loss</span>
                <p className="font-medium">
                  {typeof trade.stopLoss === 'number' ? `$${trade.stopLoss.toFixed(2)}` : '—'}
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Exit Price</span>
                <p className="font-medium">${trade.exit.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Take Profit</span>
                <p className="font-medium">
                  {typeof trade.takeProfit === 'number' ? `$${trade.takeProfit.toFixed(2)}` : '—'}
                </p>
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

          {(typeof trade.stopLoss === 'number' || typeof trade.takeProfit === 'number') ? (
            <>
              <Separator />
              <div>
                <h3 className="mb-3">SL / TP</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Risk Distance</span>
                    <p className="font-medium">{metrics.riskDistance === null ? '—' : metrics.riskDistance.toFixed(4)}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Reward Distance</span>
                    <p className="font-medium">{metrics.rewardDistance === null ? '—' : metrics.rewardDistance.toFixed(4)}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Risk Amount</span>
                    <p className="font-medium">{metrics.riskAmount === null ? '—' : metrics.riskAmount.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          <Separator />

          {/* Performance */}
          <div>
            <h3 className="mb-3">Performance</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Profit/Loss</span>
                <p className={`text-lg font-medium ${pnlTextClass(trade.pnl)}`}>
                  {formatCurrency(trade.pnl)}
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">P&L Percentage</span>
                <p className={`text-lg font-medium ${pnlTextClass(trade.pnlPercentage)}`}>
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

          {screenshots.length > 0 ? (
            <>
              <Separator />
              <div>
                <h3 className="mb-3">Screenshots</h3>
                <div className="grid grid-cols-3 gap-2">
                  {screenshots.map((path, idx) => {
                    const url = signedUrls[path]?.url;
                    return (
                      <button
                        type="button"
                        key={path}
                        onClick={() => setActiveIndex(idx)}
                        className="aspect-square overflow-hidden rounded-md border bg-muted"
                        aria-label={`Open screenshot ${idx + 1}`}
                      >
                        {url ? (
                          <img src={url} alt={`Screenshot ${idx + 1}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Dialog open={activeIndex !== null} onOpenChange={(o) => setActiveIndex(o ? activeIndex : null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <DialogTitle>Screenshots</DialogTitle>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={activeIndex === null || screenshots.length < 2}
                        onClick={() =>
                          setActiveIndex((prev) =>
                            prev === null ? null : (prev - 1 + screenshots.length) % screenshots.length,
                          )
                        }
                      >
                        Prev
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={activeIndex === null || screenshots.length < 2}
                        onClick={() =>
                          setActiveIndex((prev) => (prev === null ? null : (prev + 1) % screenshots.length))
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-center">
                    {activeUrl ? (
                      <img src={activeUrl} alt="Screenshot" className="max-h-[70vh] w-auto object-contain" />
                    ) : (
                      <div className="h-[50vh] w-full rounded-md border bg-muted" />
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
