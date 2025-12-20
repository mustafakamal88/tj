import { requireSupabaseClient } from '../app/utils/supabase';

export type MtPlatform = 'MT4' | 'MT5';
export type MtAccountType = 'live' | 'demo';

type BridgeOk<T> = { ok: true; data: T };
type BridgeFail = { ok: false; error: string };
type BridgeResponse<T> = BridgeOk<T> | BridgeFail;

function bestEdgeErrorMessage(error: unknown): string {
  const err = error as any;
  const fallback = typeof err?.message === 'string' ? err.message : 'Edge Function request failed.';

  const bodyText = err?.context?.body;
  if (typeof bodyText !== 'string' || !bodyText.trim()) return fallback;

  try {
    const parsed = JSON.parse(bodyText) as any;
    const message =
      (typeof parsed?.error === 'string' && parsed.error) ||
      (typeof parsed?.message === 'string' && parsed.message) ||
      (typeof parsed?.error?.message === 'string' && parsed.error.message);
    if (message) return message;
  } catch {
    // ignore
  }

  return bodyText;
}

async function invokeServer<T>(body: Record<string, unknown>): Promise<T> {
  const supabase = requireSupabaseClient();

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('You must be logged in to connect MetaTrader.');

  console.log('[mtBridge] invoking', body);

  const { data, error } = await supabase.functions.invoke('server', {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    console.error('[mtBridge] invoke error', error);
    throw new Error(bestEdgeErrorMessage(error));
  }

  const json = data as BridgeResponse<T> | null;
  if (!json || typeof json !== 'object') throw new Error('MT bridge returned an invalid response.');
  if (!('ok' in json) || json.ok !== true) {
    const message = (json as BridgeFail)?.error ?? 'MT bridge request failed.';
    throw new Error(message);
  }

  return (json as BridgeOk<T>).data;
}

export type MtConnectInput = {
  platform: MtPlatform;
  server: string;
  account: string;
  accountType?: MtAccountType;
  autoSync: boolean;
};

export type MtConnectResult = {
  syncKey: string;
  syncUrl: string;
  connectedAt: string;
  connection: {
    platform: MtPlatform;
    server: string;
    account: string;
    accountType?: MtAccountType;
    autoSync: boolean;
    metaapiAccountId?: string;
    connectedAt: string;
    lastSyncAt?: string;
  };
};

export async function mtConnect(input: MtConnectInput): Promise<MtConnectResult> {
  return invokeServer<MtConnectResult>({ action: 'mt_connect', ...input });
}

export async function mtDisconnect(): Promise<{ disconnected: boolean }> {
  return invokeServer<{ disconnected: boolean }>({ action: 'mt_disconnect' });
}

export type MtStatusResult = {
  connected: boolean;
  connection: (MtConnectResult['connection'] & { syncKey?: string; syncUrl?: string }) | null;
};

export async function mtStatus(): Promise<MtStatusResult> {
  return invokeServer<MtStatusResult>({ action: 'mt_status' });
}
