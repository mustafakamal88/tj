import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

