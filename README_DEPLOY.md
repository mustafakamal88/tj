# TJ — Supabase Edge Functions Deployment

This repo deploys three Supabase Edge Functions:

- `server`
- `mt-bridge`
- `billing`

The recommended deployment method is:

```bash
supabase functions deploy <name> --use-api
```

`--use-api` bundles server-side (no Docker bundling) and avoids many local Docker credential issues.

## Prerequisites

- Supabase CLI:
  - macOS: `brew install supabase/tap/supabase`
- A Supabase **Access Token** (for non-interactive auth)

## Get a Supabase Access Token

Supabase Dashboard → Account → **Access Tokens** → **Create**.

Do not commit tokens to git.

## Authenticate

Recommended (works in CI and terminals without browser login):

```bash
export SUPABASE_ACCESS_TOKEN="<YOUR_TOKEN>"
```

Interactive login (opens browser):

```bash
supabase login
```

## Link the project

Find your project ref in the Supabase URL, e.g.:

`https://<PROJECT_REF>.supabase.co`

Then:

```bash
supabase link --project-ref <PROJECT_REF>
```

This writes the ref into `supabase/.temp/project-ref`.

## Deploy all functions (recommended)

Use the script:

```bash
./scripts/deploy-functions.sh
```

Debug mode:

```bash
DEBUG=1 ./scripts/deploy-functions.sh
```

## Deploy one function manually

```bash
supabase functions deploy server --use-api --debug
supabase functions deploy mt-bridge --use-api --debug
supabase functions deploy billing --use-api --debug
```

If you are linked, you usually don’t need `--project-ref`, but it is supported:

```bash
supabase functions deploy server --use-api --project-ref <PROJECT_REF> --debug
```

## Setting secrets

Set secrets in the Supabase Dashboard or via CLI:

```bash
supabase secrets set SITE_URL="https://your-domain.com" --project-ref <PROJECT_REF>
```

Billing function (optional):

- Stripe
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PRICE_PRO`
  - `STRIPE_PRICE_PREMIUM`

- PayPal (sandbox)
  - `PAYPAL_BASE_URL` (e.g. `https://api-m.sandbox.paypal.com`)
  - `PAYPAL_CLIENT_ID`
  - `PAYPAL_CLIENT_SECRET`
  - `PAYPAL_PLAN_ID_PRO`
  - `PAYPAL_PLAN_ID_PREMIUM`

## Common errors and fixes

### "entrypoint path does not exist (supabase/functions/<name>/index.ts)"

Supabase expects `supabase/functions/<name>/index.ts`.

Fix:
- Ensure the file exists and is named `index.ts` (not `index.tsx`).

### "Cannot use automatic login flow inside non-TTY environments"

Fix:

```bash
export SUPABASE_ACCESS_TOKEN="..."
```

### Docker credential errors (e.g. `docker-credential-desktop` missing)

Use API bundling:

```bash
supabase functions deploy <name> --use-api
```

## Edge function pitfalls checklist

- Avoid Node-only imports (`fs`, `path`, etc.).
- Use Edge-safe imports (e.g. `npm:` or `jsr:`) and `Deno.env.get()` for env vars.
- Keep entry files as `index.ts`.
