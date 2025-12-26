  # Trade Journaling Website

  This is a code bundle for Trade Journaling Website.

  ## Environment variables

  Copy `.env.example` to `.env.local` and set:

  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - Optional debug: `VITE_DEBUG_PROFILE=true` (logs auth/profile fetches in browser console)

  ## Supabase Auth URL configuration (important for Vercel)

  In Supabase Dashboard → Authentication → URL Configuration:

  - Site URL: set to your production domain (e.g. `https://<your-vercel-domain>`)
  - Additional Redirect URLs: include:
    - `http://localhost:5173` (local dev)
    - `https://<your-vercel-domain>` (production)

  If these are not set, login/signup can work locally but fail or behave differently on Vercel.

  ## Supabase Realtime (Live Broker Matrix)

  The Live Broker Matrix uses Supabase Realtime subscriptions on `public.broker_live_state`.

  - The migration attempts to add the table to the `supabase_realtime` publication.
  - If your project manages Realtime via the dashboard, ensure `broker_live_state` is enabled for Realtime.

  The Edge Function `broker-live-upsert` requires a Supabase Function secret:

  - `TJ_INTERNAL_KEY` (requests must send header `x-tj-internal-key` matching this value)

  Note: `broker-import` writes to `broker_live_state` directly using a service role key.
  This project expects the function secret `TJ_SERVICE_ROLE_KEY` to be set (used by `broker-import` to avoid relying on reserved `SUPABASE_*` env vars).

  The dashboard will also call the RPC `ensure_broker_live_state()` once on load to seed missing rows from your broker connections.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Broker import (MetaApi)

  See `scripts/manual/metaapi-test.md`.
