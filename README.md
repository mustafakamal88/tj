  # Trade Journaling Website

  This is a code bundle for Trade Journaling Website. The original project is available at https://www.figma.com/design/p0XFW4qLWYlOTQFqk9pnO6/Trade-Journaling-Website.

  ## Environment variables

  Copy `.env.example` to `.env.local` and set:

  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - Optional (MT4/MT5 direct sync): `VITE_MT_BRIDGE_URL`

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## MT4/MT5 direct sync (MetaApi)

  See `mt-bridge/README.md`.
