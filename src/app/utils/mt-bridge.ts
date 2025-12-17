import { requireSupabaseClient } from './supabase';

type MtPlatform = 'MT4' | 'MT5';

type BridgeOk<T> = { ok: true; data: T };
type BridgeFail = { ok: false; error: string };
type BridgeResponse<T> = BridgeOk<T> | BridgeFail;

function getMtBridgeUrl(): string {
  const raw = import.meta.env.VITE_MT_BRIDGE_URL as string | undefined;
  if (!raw) {
    throw new Error('MT bridge is not configured. Set VITE_MT_BRIDGE_URL (see .env.example).');
  }
  return raw.replace(/\/+$/, '');
}

async function getAccessToken(): Promise<string> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error('You must be logged in to sync MetaTrader.');
  return token;
}

async function requestBridge<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const token = await getAccessToken();
  const url = `${getMtBridgeUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  const controller = new AbortController();
  const timeoutMs = 20_000;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: options?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (String((err as any)?.name) === 'AbortError') {
      throw new Error(`MT bridge request timed out after ${Math.round(timeoutMs / 1000)}s. Check function deploy/CORS.`);
    }
    throw err instanceof Error ? err : new Error('MT bridge request failed.');
  } finally {
    window.clearTimeout(timeout);
  }

  const json = (await res.json().catch(() => null)) as BridgeResponse<T> | null;
  if (!json) throw new Error(`MT bridge returned an invalid response (HTTP ${res.status}).`);

  if (!res.ok || !json.ok) {
    const message = (json as BridgeFail)?.error || `MT bridge request failed (${res.status}).`;
    throw new Error(message);
  }

  return (json as BridgeOk<T>).data;
}

export type MtBridgeConnectInput = {
  platform: MtPlatform;
  server: string;
  account: string;
  investorPassword: string;
  accountType?: 'live' | 'demo';
  autoSync: boolean;
};

export type MtBridgeConnectResult = {
  connectedAt: string;
  upserted: number;
  lastSyncAt?: string;
};

export async function mtBridgeConnect(input: MtBridgeConnectInput): Promise<MtBridgeConnectResult> {
  return requestBridge<MtBridgeConnectResult>('/connect', { method: 'POST', body: input });
}

export type MtBridgeSyncResult = {
  upserted: number;
  lastSyncAt?: string;
};

export async function mtBridgeSync(): Promise<MtBridgeSyncResult> {
  return requestBridge<MtBridgeSyncResult>('/sync', { method: 'POST' });
}

export async function mtBridgeDisconnect(): Promise<{ disconnected: boolean }> {
  return requestBridge<{ disconnected: boolean }>('/disconnect', { method: 'POST' });
}

export type MtBridgeMetricsResult = {
  metrics: unknown;
};

export async function mtBridgeMetrics(includeOpenPositions = false): Promise<MtBridgeMetricsResult> {
  const query = includeOpenPositions ? '?includeOpen=true' : '';
  return requestBridge<MtBridgeMetricsResult>(`/metrics${query}`, { method: 'GET' });
}

export type MtBridgeStatus = {
  connected: boolean;
  record: {
    platform: MtPlatform;
    server: string;
    account: string;
    accountType?: 'live' | 'demo';
    autoSync: boolean;
    connectedAt: string;
    lastSyncAt?: string;
  } | null;
};

export async function mtBridgeStatus(): Promise<MtBridgeStatus> {
  return requestBridge<MtBridgeStatus>('/status', { method: 'GET' });
}

export function isMtBridgeConfigured(): boolean {
  return Boolean(import.meta.env.VITE_MT_BRIDGE_URL);
}
