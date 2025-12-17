# TJ MT Bridge (MetaApi)

This is an optional backend service you can host on a Windows VPS (or any server) to import MT4/MT5 history **directly from the broker** using server + account number + investor password via **MetaApi**.

The frontend calls this bridge using your Supabase session JWT (Bearer token). The bridge verifies the token, then syncs trades into your Supabase `trades` table using the Supabase service role key.

## Prerequisites

- Node.js 20+
- A MetaApi account + API token
- Supabase project URL + Service Role key

## Setup

1. Create `mt-bridge/.env`:

```bash
PORT=8787
METAAPI_TOKEN=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

2. Install and run:

```bash
cd mt-bridge
npm install
npm run start
```

3. In your frontend `.env.local`, set:

```bash
VITE_MT_BRIDGE_URL=http://YOUR_VPS_IP:8787
```

Restart the Vite dev server after changing env vars.

## Endpoints

- `GET /health` – health check
- `POST /connect` – connect account and run initial sync
- `POST /sync` – sync latest closed trades
- `POST /disconnect` – remove connection (and delete MetaApi account)
- `GET /status` – connection status
- `GET /metrics` – MetaStats metrics (query: `?includeOpen=true`)

All endpoints (except `/health`) require `Authorization: Bearer <supabase_access_token>`.
