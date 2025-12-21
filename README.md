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

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Broker import (MetaApi)

  See `scripts/manual/metaapi-test.md`.
