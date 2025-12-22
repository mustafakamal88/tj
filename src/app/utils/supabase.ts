import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';

let client: SupabaseClient | null = null;

const GLOBAL_KEY = '__tj_supabase_client__';

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  const globalAny = globalThis as unknown as Record<string, unknown>;
  const existing = globalAny[GLOBAL_KEY];
  if (existing && typeof existing === 'object') {
    client = existing as SupabaseClient;
    return client;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  const storage = typeof window !== 'undefined' ? window.localStorage : undefined;

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage,
    },
  });
  globalAny[GLOBAL_KEY] = client;
  return client;
}

export function requireSupabaseClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).',
    );
  }
  return client;
}

let lastSessionExpiredToastAtMs = 0;

export function toastSessionExpiredOnce(): void {
  const now = Date.now();
  if (now - lastSessionExpiredToastAtMs < 10_000) return;
  lastSessionExpiredToastAtMs = now;
  toast.error('Session expired, please login again.');
}

type SupabaseErrorKind = 'auth' | 'permission' | 'network' | 'unknown';

function toStatusCode(status: unknown): number | null {
  if (typeof status === 'number' && Number.isFinite(status)) return status;
  if (typeof status === 'string') {
    const n = Number(status);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function errorText(error: unknown): string {
  if (!error) return '';
  const message = typeof (error as any)?.message === 'string' ? String((error as any).message) : '';
  const details = typeof (error as any)?.details === 'string' ? String((error as any).details) : '';
  const hint = typeof (error as any)?.hint === 'string' ? String((error as any).hint) : '';
  const code = typeof (error as any)?.code === 'string' ? String((error as any).code) : '';
  return `${message} ${details} ${hint} ${code}`.trim();
}

function looksLikeNetworkErrorMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('fetch failed') ||
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('ecconnreset') ||
    m.includes('enotfound') ||
    m.includes('econnrefused')
  );
}

function looksLikeAuthErrorMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('jwt') || m.includes('token') || m.includes('expired') || m.includes('not_authenticated');
}

function looksLikeRlsErrorMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('row-level security') || m.includes('permission denied') || m.includes('not allowed');
}

export function classifySupabaseError(input: { error?: unknown; status?: unknown }): SupabaseErrorKind {
  const status = toStatusCode(input.status);
  if (status === 401) return 'auth';
  if (status === 403) return 'permission';

  const text = errorText(input.error);
  if (looksLikeNetworkErrorMessage(text)) return 'network';
  if (looksLikeRlsErrorMessage(text)) return 'permission';
  if (looksLikeAuthErrorMessage(text)) return 'auth';
  return 'unknown';
}

export async function ensureSession(supabase: SupabaseClient): Promise<Session | null> {
  const first = await supabase.auth.getSession();
  let session = first.data.session;
  if (session) return session;

  try {
    await supabase.auth.refreshSession();
  } catch {
    // ignore
  }

  const second = await supabase.auth.getSession();
  session = second.data.session;
  return session ?? null;
}

export async function toastSupabaseError(
  supabase: SupabaseClient,
  input: { error?: unknown; status?: unknown },
): Promise<void> {
  const kind = classifySupabaseError(input);

  if (kind === 'permission') {
    toast.error('No permission / RLS policy blocked.');
    return;
  }

  if (kind === 'network') {
    toast.error('Network error, please retry.');
    return;
  }

  if (kind === 'auth') {
    const session = await ensureSession(supabase);
    if (!session) {
      toastSessionExpiredOnce();
    } else {
      toast.error('Authentication error, please retry.');
    }
    return;
  }

  toast.error('Something went wrong. Please retry.');
}

