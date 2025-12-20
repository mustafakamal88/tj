/**
 * End-to-end MT sync test (connect -> POST trades).
 *
 * Usage:
 *   SUPABASE_URL="https://<ref>.supabase.co" \
 *   SUPABASE_ANON_KEY="..." \
 *   TEST_EMAIL="user@example.com" \
 *   TEST_PASSWORD="..." \
 *   MT_PLATFORM="MT5" \
 *   MT_SERVER="Exness-MT5Trial" \
 *   MT_ACCOUNT="123456" \
 *   MT_ACCOUNT_TYPE="demo" \
 *   npx tsx scripts/test-mt-sync.ts
 */

import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
  const email = requireEnv('TEST_EMAIL');
  const password = requireEnv('TEST_PASSWORD');

  const platform = (process.env.MT_PLATFORM as 'MT4' | 'MT5' | undefined) ?? 'MT5';
  const server = process.env.MT_SERVER ?? 'Exness-MT5Trial';
  const account = process.env.MT_ACCOUNT ?? '123456';
  const accountType = (process.env.MT_ACCOUNT_TYPE as 'live' | 'demo' | undefined) ?? 'demo';

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) throw authError;
  if (!authData.session?.access_token) throw new Error('No session token returned from Supabase.');

  console.log('[test-mt-sync] signed in', { userId: authData.user?.id, email });

  const { data: connectData, error: connectError } = await supabase.functions.invoke('server', {
    body: {
      action: 'mt_connect',
      platform,
      server,
      account,
      accountType,
      autoSync: false,
    },
  });

  if (connectError) throw connectError;
  if (!connectData?.ok) throw new Error(connectData?.error ?? 'mt_connect failed');

  const payload = connectData.data as { syncKey: string; syncUrl: string };
  if (!payload?.syncKey || !payload?.syncUrl) throw new Error('Missing syncKey/syncUrl in mt_connect response.');

  console.log('[test-mt-sync] mt_connect ok', { syncUrl: payload.syncUrl });

  const res = await fetch(payload.syncUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TJ-Sync-Key': payload.syncKey,
    },
    body: JSON.stringify({
      trades: [
        {
          ticket: '123456',
          symbol: 'EURUSD',
          type: 'buy',
          open_price: 1.1,
          close_price: 1.12,
          volume: 0.01,
          profit: 10.5,
          close_time: '2025.12.20 10:00:00',
        },
      ],
    }),
  });

  const bodyText = await res.text();
  console.log('[test-mt-sync] mt/sync response', { status: res.status, body: bodyText });

  if (!res.ok) {
    throw new Error(`mt/sync failed (HTTP ${res.status})`);
  }
}

main().catch((e) => {
  console.error('[test-mt-sync] failed', e);
  process.exitCode = 1;
});

