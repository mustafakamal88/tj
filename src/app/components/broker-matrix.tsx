import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { formatCurrency } from '../utils/trade-calculations';
import { semanticColors } from '../utils/semantic-colors';
import {
  getBrokerLiveState,
  subscribeBrokerLiveState,
  type BrokerLiveStateRow,
  type BrokerLiveStateChange,
} from '../utils/broker-live';

function keyOf(row: { broker: string; account_id: string }) {
  return `${row.broker}::${row.account_id}`;
}

function formatMaybeCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return formatCurrency(value);
}

function formatMaybeInt(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return String(Math.trunc(value));
}

function pnlClass(value: number | null) {
  if (value === null || !Number.isFinite(value) || value === 0) return 'text-muted-foreground';
  return value > 0 ? semanticColors.profitText : semanticColors.lossText;
}

function formatMaybePercent(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

function marginLevelPercent(equity: number | null, marginUsed: number | null): number | null {
  if (equity === null || !Number.isFinite(equity)) return null;
  if (marginUsed === null || !Number.isFinite(marginUsed) || marginUsed <= 0) return null;
  return (equity / marginUsed) * 100;
}

function leverageFromMeta(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as any).leverage;
  if (typeof raw === 'string') {
    const s = raw.trim();
    return s ? s : null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return null;
}

function statusLabel(status: BrokerLiveStateRow['status']) {
  if (status === 'live') return 'Live';
  if (status === 'syncing') return 'Syncing';
  if (status === 'error') return 'Error';
  return 'Stale';
}

function statusClass(status: BrokerLiveStateRow['status']) {
  if (status === 'live') return semanticColors.profitText;
  if (status === 'error') return semanticColors.lossText;
  return 'text-muted-foreground';
}

export type BrokerMatrixProps = {
  userId: string | null | undefined;
};

export function BrokerMatrix({ userId }: BrokerMatrixProps) {
  const [rows, setRows] = useState<BrokerLiveStateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'realtime' | 'polling' | 'unavailable'>('unavailable');

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.broker !== b.broker) return a.broker.localeCompare(b.broker);
      return a.account_id.localeCompare(b.account_id);
    });
  }, [rows]);

  useEffect(() => {
    let mounted = true;
    if (!userId) {
      setRows([]);
      setLoading(false);
      setMode('unavailable');
      return;
    }

    setLoading(true);

    void (async () => {
      const initial = await getBrokerLiveState();
      if (!mounted) return;
      setRows(initial);
      setLoading(false);
    })();

    const applyChange = (change: BrokerLiveStateChange) => {
      if (!mounted) return;

      if (change.type === 'mode') {
        setMode(change.mode);
        return;
      }

      if (change.type === 'snapshot') {
        setRows(change.rows);
        return;
      }

      if (change.type === 'delete') {
        setRows((prev) => prev.filter((r) => keyOf(r) !== keyOf(change.key)));
        return;
      }

      if (change.type === 'upsert') {
        setRows((prev) => {
          const k = keyOf(change.row);
          const next = prev.filter((r) => keyOf(r) !== k);
          next.unshift(change.row);
          return next;
        });
      }
    };

    const sub = subscribeBrokerLiveState(userId, applyChange, { pollIntervalMs: 15_000 });

    return () => {
      mounted = false;
      sub.unsubscribe();
    };
  }, [userId]);

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">Live Broker Matrix</div>
          <div className="text-xs text-muted-foreground mt-1">
            Real-time account metrics update automatically.
          </div>
        </div>

        <Badge variant="outline" className="text-xs">
          {mode === 'realtime' ? 'Realtime' : mode === 'polling' ? 'Polling' : 'Offline'}
        </Badge>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-4 text-sm text-muted-foreground">
          No live broker accounts yet.
        </div>
      ) : (
        <div className="mt-4">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Broker / Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sync</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Equity</TableHead>
                <TableHead>Floating PnL</TableHead>
                <TableHead>Margin used</TableHead>
                <TableHead>Free margin</TableHead>
                <TableHead>Margin level</TableHead>
                <TableHead>Leverage</TableHead>
                <TableHead>Open trades</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const lastSync = r.last_sync_at ? new Date(r.last_sync_at) : null;
                const lastSyncText = lastSync && Number.isFinite(lastSync.getTime())
                  ? `${formatDistanceToNowStrict(lastSync, { addSuffix: true })}`
                  : '—';

                const marginLevel = marginLevelPercent(r.equity, r.margin_used);
                const leverage = leverageFromMeta(r.meta);

                return (
                  <TableRow key={r.id} className="transition-colors">
                    <TableCell className="min-w-[180px]">
                      <div className="font-medium">{r.broker}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{r.account_id}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusClass(r.status)}>
                        {statusLabel(r.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lastSyncText}</TableCell>
                    <TableCell className="tabular-nums">{formatMaybeCurrency(r.balance)}</TableCell>
                    <TableCell className="tabular-nums">{formatMaybeCurrency(r.equity)}</TableCell>
                    <TableCell className={`tabular-nums ${pnlClass(r.floating_pnl)}`}>
                      {formatMaybeCurrency(r.floating_pnl)}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatMaybeCurrency(r.margin_used)}</TableCell>
                    <TableCell className="tabular-nums">{formatMaybeCurrency(r.free_margin)}</TableCell>
                    <TableCell className="tabular-nums">{formatMaybePercent(marginLevel)}</TableCell>
                    <TableCell className="tabular-nums">{leverage ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{formatMaybeInt(r.open_positions_count)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
