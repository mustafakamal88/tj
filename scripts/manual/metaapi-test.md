# MetaApi broker import (manual test)

This project uses a Supabase Edge Function `broker-import` to connect a MetaTrader account via MetaApi and import closed trade history into `public.trades`.

## 1) Required Supabase secrets (server-side only)

Set these in Supabase Dashboard → Edge Functions → Secrets or via CLI:

```bash
supabase secrets set METAAPI_TOKEN="..." --project-ref <PROJECT_REF>
supabase secrets set METAAPI_BASE_URL="https://mt-client-api-v1.london.agiliumtrade.ai" --project-ref <PROJECT_REF>
```

Optional override (defaults to the correct provisioning base):

```bash
supabase secrets set METAAPI_PROVISIONING_URL="https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai" --project-ref <PROJECT_REF>
```

## 2) Deploy

```bash
supabase functions deploy broker-import --use-api --project-ref <PROJECT_REF> --debug
```

## 3) Get a user JWT

The endpoints require a Supabase user JWT (access token). Easiest:

- Log into the TJ app in the browser
- Grab the access token from DevTools → Application → Local Storage → `sb-...-auth-token`

Export it:

```bash
export USER_JWT="eyJ..."
export SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
export SUPABASE_ANON_KEY="sb_publishable_..."
```

## 4) Connect

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/broker-import/connect" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "platform":"mt5",
    "server":"Exness-MT5Trial",
    "login":"247939759",
    "password":"INVESTOR_PASSWORD_HERE",
    "type":"cloud-g2"
  }'
```

Copy the returned `connection.id`.

## 5) Import full history

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/broker-import/import" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "connectionId":"<CONNECTION_ID>" }'
```

Optional date range:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/broker-import/import" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "connectionId":"<CONNECTION_ID>", "from":"2023-01-01T00:00:00.000Z", "to":"2025-01-01T00:00:00.000Z" }'
```

## 6) Status (connections)

```bash
curl -sS "$SUPABASE_URL/functions/v1/broker-import/status" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"
```

## 7) Verify in SQL

```sql
select
  count(*) as trades,
  min(close_time) as first_close,
  max(close_time) as last_close
from public.trades
where user_id = auth.uid()
  and broker_provider = 'metaapi';
```

And check duplicates are prevented:

```sql
select broker_provider, account_login, position_id, ticket, count(*)
from public.trades
where broker_provider = 'metaapi'
group by 1,2,3,4
having count(*) > 1;
```

