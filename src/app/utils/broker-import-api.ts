import { requireSupabaseClient } from './supabase';

export type BrokerPlatform = 'mt4' | 'mt5';
export type BrokerEnvironment = 'demo' | 'live';

export type BrokerConnectionStatus = 'created' | 'deploying' | 'connected' | 'error';

export type BrokerConnection = {
  id: string;
  provider: 'metaapi';
  metaapiAccountId: string;
  platform: BrokerPlatform;
  environment: BrokerEnvironment;
  server: string | null;
  login: string | null;
  status: BrokerConnectionStatus;
  lastImportAt: string | null;
  createdAt: string;
  updatedAt: string;
  tradeCount?: number;
};

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; error: string; code?: string; details?: unknown };
type ApiResponse<T> = Ok<T> | Fail;

function mapConnection(row: any): BrokerConnection {
  return {
    id: String(row.id),
    provider: 'metaapi',
    metaapiAccountId: String(row.metaapi_account_id ?? ''),
    platform: (row.platform ?? 'mt5') as BrokerPlatform,
    environment: (row.environment ?? 'demo') as BrokerEnvironment,
    server: row.server ?? null,
    login: row.login ?? null,
    status: (row.status ?? 'created') as BrokerConnectionStatus,
    lastImportAt: row.last_import_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tradeCount: typeof row.trade_count === 'number' ? row.trade_count : undefined,
  };
}

function bestErrorMessageFromContextBody(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === 'object') {
    const err = (body as any).error;
    if (typeof err === 'string' && err.trim()) return err;
    return null;
  }
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      const err = (parsed as any)?.error;
      if (typeof err === 'string' && err.trim()) return err;
    } catch {
      // non-JSON response body
      if (trimmed.length < 240) return trimmed;
    }
  }
  return null;
}

function toInvokeErrorMessage(error: any): string {
  const status = error?.context?.status as number | undefined;
  const ctxBody = error?.context?.body;
  const ctxMsg = bestErrorMessageFromContextBody(ctxBody);
  let base = ctxMsg ?? (typeof error?.message === "string" ? error.message : "Request failed.");
  if (base === "Failed to fetch") {
    base =
      "Unable to reach the broker-import Edge Function. Check that it is deployed and VITE_SUPABASE_URL points to your Supabase project.";
  }
  return status ? `${base} (HTTP ${status})` : base;
}

async function requireAccessToken(): Promise<string> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error('You must be logged in.');
  return token;
}

async function invokeBrokerImport<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  const token = await requireAccessToken();

  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.functions.invoke<ApiResponse<T>>('broker-import', {
    body: { action, ...(payload ?? {}) },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    console.error('[broker-import] invoke error', error);
    throw new Error(toInvokeErrorMessage(error));
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Broker import returned an invalid response.');
  }

  if (!('ok' in data) || (data as any).ok !== true) {
    const message = ((data as Fail).error ?? 'Broker import failed.').trim();
    throw new Error(message || 'Broker import failed.');
  }

  return (data as Ok<T>).data;
}

export async function getMetaApiStatus(): Promise<{ connections: BrokerConnection[] }> {
  const out = await invokeBrokerImport<{ connections: any[] }>('status');
  return { connections: (out.connections ?? []).map(mapConnection) };
}

export type ConnectMetaApiInput = {
  platform: BrokerPlatform;
  environment: BrokerEnvironment;
  server: string;
  login: string;
  password: string;
};

export async function connectMetaApi(input: ConnectMetaApiInput): Promise<{ connection: BrokerConnection }> {
  const out = await invokeBrokerImport<{ connection: any }>('connect', input);
  return { connection: mapConnection(out.connection) };
}

export type ImportMetaApiInput = {
  connectionId: string;
  from?: string;
  to?: string;
};

export type ImportMetaApiResult = {
  imported: number;
  upserted: number;
  totalFetched: number;
};

export async function importMetaApi(input: ImportMetaApiInput): Promise<ImportMetaApiResult> {
  return invokeBrokerImport<ImportMetaApiResult>('import', input);
}
