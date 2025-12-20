# MT Bridge (TJ) — Supabase Edge Function `server`

TJ supports MT4/MT5 syncing via a **push** model:

- Your TJ app generates a **Sync URL + Sync Key**
- Your MetaTrader EA/connector **POSTs closed trades** to the Sync URL with `X-TJ-Sync-Key`
- The Edge Function normalizes trades and upserts into `public.trades`

## Required Supabase secrets

Set in Supabase Dashboard → Project Settings → Secrets (or via CLI):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `METAAPI_BASE_URL` (e.g. `https://mt-client-api-v1.london.agiliumtrade.ai`)
- `METAAPI_TOKEN`
- `SITE_URL` (optional, used for CORS allowlist; set to your Vercel domain)

## Deploy

MetaTrader does **not** send a Supabase JWT, so JWT verification must be disabled for this function.

```bash
supabase functions deploy server --use-api --no-verify-jwt --debug
```

Or deploy everything:

```bash
./scripts/deploy-functions.sh
```

## Verify health (KV + env)

```bash
curl -sS "https://<PROJECT_REF>.supabase.co/functions/v1/server/make-server-a46fa5d6/health"
```

Expected:

```json
{ "status": "ok" }
```

## Sync flow

### 1) Connect (from the TJ UI)

Open Dashboard → **MT4/MT5 Sync** → connect and copy:
- Sync URL
- Sync Key

## Frontend usage (internal)

The app calls the Edge Function using `supabase.functions.invoke("server")` via `src/lib/mtBridge.ts`:

```ts
import { mtConnect, mtDisconnect, mtStatus } from '../lib/mtBridge';

await mtConnect({ platform: 'MT5', server: 'Exness-MT5Trial', account: '123456', autoSync: false });
await mtStatus();
await mtDisconnect();
```

### 2) Push trades (EA/connector)

Example request (curl):

```bash
curl -sS -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/server/make-server-a46fa5d6/mt/sync" \
  -H "Content-Type: application/json" \
  -H "X-TJ-Sync-Key: <SYNC_KEY>" \
  --data '{
    "trades": [
      {
        "ticket": "123456",
        "symbol": "EURUSD",
        "type": "buy",
        "open_price": 1.1,
        "close_price": 1.12,
        "volume": 0.01,
        "profit": 10.5,
        "close_time": "2025.12.20 10:00:00"
      }
    ]
  }'
```

Notes:
- Use header `X-TJ-Sync-Key`. Query param `?key=` exists only as a fallback.
- Rate limit: requests faster than ~800ms per key return HTTP `429`.
- Free plan is limited (trial + 15 trades). Pro/Premium sync unlimited.

## Local test script

Run a full connect + sync test:

```bash
# Requires: SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD
npx tsx scripts/test-mt-sync.ts
```
