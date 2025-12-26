import { getSupabaseClient } from './supabase';

export type BrokerLiveStatus = 'live' | 'syncing' | 'error' | 'stale';

export type BrokerLiveStateRow = {
  id: string;
  user_id: string;
  broker: string;
  account_id: string;
  status: BrokerLiveStatus;
  last_sync_at: string;
  equity: number | null;
  balance: number | null;
  floating_pnl: number | null;
  open_positions_count: number | null;
  margin_used: number | null;
  free_margin: number | null;
  exposure: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  updated_at: string;
};

export type BrokerLiveStateChange =
  | { type: 'upsert'; row: BrokerLiveStateRow }
  | { type: 'delete'; key: { broker: string; account_id: string } }
  | { type: 'snapshot'; rows: BrokerLiveStateRow[] }
  | { type: 'mode'; mode: 'realtime' | 'polling' | 'unavailable' };

export async function ensureBrokerLiveState(): Promise<BrokerLiveStateRow[] | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('ensure_broker_live_state');
  if (error) {
    console.warn('[broker-live] ensureBrokerLiveState failed', error);
    return null;
  }

  return (data ?? []) as BrokerLiveStateRow[];
}

export async function getBrokerLiveState(): Promise<BrokerLiveStateRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('broker_live_state')
    .select(
      'id,user_id,broker,account_id,status,last_sync_at,equity,balance,floating_pnl,open_positions_count,margin_used,free_margin,exposure,meta,updated_at',
    )
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('[broker-live] getBrokerLiveState failed', error);
    return [];
  }

  return (data ?? []) as BrokerLiveStateRow[];
}

function startPolling(onChange: (change: BrokerLiveStateChange) => void, intervalMs: number) {
  let timer: number | null = null;

  const tick = async () => {
    const rows = await getBrokerLiveState();
    onChange({ type: 'snapshot', rows });
  };

  void tick();
  timer = window.setInterval(() => void tick(), intervalMs);

  return () => {
    if (timer) window.clearInterval(timer);
  };
}

export function subscribeBrokerLiveState(
  userId: string,
  onChange: (change: BrokerLiveStateChange) => void,
  options?: { pollIntervalMs?: number },
): { unsubscribe: () => void } {
  const supabase = getSupabaseClient();
  const pollIntervalMs = options?.pollIntervalMs ?? 15_000;

  if (!supabase || typeof window === 'undefined') {
    onChange({ type: 'mode', mode: 'unavailable' });
    const stopPolling = typeof window === 'undefined' ? () => {} : startPolling(onChange, pollIntervalMs);
    return { unsubscribe: stopPolling };
  }

  let stopPolling: (() => void) | null = null;
  let closed = false;

  const beginPolling = () => {
    if (stopPolling) return;
    onChange({ type: 'mode', mode: 'polling' });
    stopPolling = startPolling(onChange, pollIntervalMs);
  };

  const channel = supabase
    .channel(`broker_live_state:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'broker_live_state',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const eventType = String((payload as any)?.eventType ?? '').toUpperCase();
        if (eventType === 'DELETE') {
          const oldRow = (payload as any)?.old;
          const broker = typeof oldRow?.broker === 'string' ? oldRow.broker : null;
          const accountId = typeof oldRow?.account_id === 'string' ? oldRow.account_id : null;
          if (broker && accountId) onChange({ type: 'delete', key: { broker, account_id: accountId } });
          return;
        }

        const row = (payload as any)?.new;
        if (!row || typeof row !== 'object') return;
        onChange({ type: 'upsert', row: row as BrokerLiveStateRow });
      },
    )
    .subscribe((status) => {
      if (closed) return;

      const s = String(status).toUpperCase();
      if (s === 'SUBSCRIBED') {
        onChange({ type: 'mode', mode: 'realtime' });
        return;
      }

      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        beginPolling();
      }
    });

  // Safety timeout: if we don't subscribe quickly, fall back to polling.
  const safetyTimer = window.setTimeout(() => {
    if (closed) return;
    beginPolling();
  }, 5_000);

  return {
    unsubscribe: () => {
      closed = true;
      window.clearTimeout(safetyTimer);
      if (stopPolling) stopPolling();
      supabase.removeChannel(channel);
    },
  };
}
