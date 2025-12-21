import { requireSupabaseClient } from '../app/utils/supabase';

type BrokerPlatform = 'mt4' | 'mt5';

export type BrokerConnection = {
  id: string;
  provider: 'metaapi';
  metaapi_account_id: string;
  server: string | null;
  login: string | null;
  account_type: string | null;
  status: 'created' | 'deploying' | 'connected' | 'error';
  last_import_at: string | null;
  created_at: string;
  updated_at: string;
};

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; error: string; code?: string; details?: unknown };
type ApiResponse<T> = Ok<T> | Fail;

function safeTrimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function supabaseFunctionsBaseUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) throw new Error('Missing VITE_SUPABASE_URL.');
  return `${safeTrimTrailingSlashes(url)}/functions/v1`;
}

function anonKey(): string {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!key) throw new Error('Missing VITE_SUPABASE_ANON_KEY.');
  return key;
}

async function requireAccessToken(): Promise<string> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error('You must be logged in.');
  return token;
}

async function callBrokerImport<T>(path: string, init: RequestInit): Promise<T> {
  const token = await requireAccessToken();
  const res = await fetch(`${supabaseFunctionsBaseUrl()}/broker-import${path}`, {
    ...init,
    headers: {
      apikey: anonKey(),
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!json || typeof json !== 'object') {
    throw new Error(`Broker import returned an invalid response (HTTP ${res.status}).`);
  }

  if (!('ok' in json) || json.ok !== true) {
    const message = (json as Fail).error ?? `Broker import failed (HTTP ${res.status}).`;
    throw new Error(message);
  }

  return (json as Ok<T>).data;
}

export async function brokerStatus(): Promise<{ connections: BrokerConnection[] }> {
  return callBrokerImport<{ connections: BrokerConnection[] }>('/status', { method: 'GET' });
}

export type BrokerConnectInput = {
  platform: BrokerPlatform;
  server: string;
  login: string;
  password: string;
  type?: string; // MetaApi cloud type (cloud-g1/cloud-g2)
  accountType?: 'demo' | 'live';
};

export async function brokerConnect(input: BrokerConnectInput): Promise<{ connection: BrokerConnection }> {
  return callBrokerImport<{ connection: BrokerConnection }>('/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export type BrokerImportInput = {
  connectionId: string;
  from?: string;
  to?: string;
};

export type BrokerImportResult = {
  imported: number;
  upserted: number;
  totalFetched: number;
};

export async function brokerImportHistory(input: BrokerImportInput): Promise<BrokerImportResult> {
  return callBrokerImport<BrokerImportResult>('/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

