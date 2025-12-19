# Stripe Webhook (Supabase Edge Function)

This Edge Function receives Stripe webhook events and updates `public.profiles` using the Supabase **service role**.

## Important: JWT verification must be disabled

Stripe sends webhooks **without** a Supabase JWT, so this function must be deployed with JWT verification disabled:

- `supabase/functions/stripe-webhook/config.toml` contains:
  - `verify_jwt = false`
- `supabase/config.toml` also contains:
  - `[functions.stripe-webhook] verify_jwt = false`

Either config should work depending on your Supabase CLI/version; keeping both avoids accidental 401s.

If you see `HTTP 401` with `Missing authorization header` in Stripe, the config was not applied at deploy time.

## Deploy

```bash
supabase functions deploy stripe-webhook --use-api --debug
```

## Quick validation (no Authorization header)

This must NOT return `401`. It should return `400` (invalid/missing signature) unless you provide a valid Stripe signature.

```bash
PROJECT_REF=<your_project_ref> ./scripts/test-webhook.sh
```

Expected:
- HTTP `400`
- body like `{"error":"Invalid Stripe-Signature header."}` (or `{"error":"Invalid signature."}`)

## Stripe Dashboard setup

Webhook URL:

`https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`

Recommended events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Secrets required (Supabase)

Set these as **Supabase Edge Function secrets** (not Vercel):
- `STRIPE_SECRET_KEY` (`sk_test_...`) – used to fetch/cancel subscriptions for idempotency + mapping
- `STRIPE_WEBHOOK_SECRET` (`whsec_...`)
- `STRIPE_PRICE_PRO` (`price_...`)
- `STRIPE_PRICE_PREMIUM` (`price_...`)

## What should happen after resending Stripe events

Resending a failed Stripe event should return `2xx` (or `400` only if your signature is invalid).
After a valid delivery, `public.profiles` will be updated:
- `subscription_plan`
- `subscription_status`
- `stripe_subscription_id`
- `current_period_end`
