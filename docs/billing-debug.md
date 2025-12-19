# Billing / Stripe Debug Guide (TJ Trade Journal)

This project uses **Stripe subscriptions (test mode)** + **Supabase Edge Functions** to keep `public.profiles` in sync:

- Checkout/session creation: `supabase/functions/billing`
- Webhook sync: `supabase/functions/stripe-webhook` (server-to-server, **no JWT**)

## 1) Deploy commands

```bash
# Requires your project to be linked:
# supabase link --project-ref <PROJECT_REF>

# Billing requires a logged-in user (JWT verification ON):
supabase functions deploy billing --use-api --debug

# Webhooks do NOT send Authorization header (JWT verification OFF):
supabase functions deploy stripe-webhook --use-api --no-verify-jwt --debug
```

## 2) Required Supabase secrets

Set these in Supabase (not Vercel):

```bash
supabase secrets set \
  STRIPE_SECRET_KEY="sk_test_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  STRIPE_PRICE_PRO="price_..." \
  STRIPE_PRICE_PREMIUM="price_..." \
  SITE_URL="https://<your-vercel-domain>" \
  --project-ref <PROJECT_REF>
```

## 3) Verify webhook is NOT blocked by JWT (no Authorization header)

```bash
PROJECT_REF=<PROJECT_REF> ./scripts/test-webhook.sh
```

Expected:
- HTTP `400` (invalid signature) or `405` (wrong method)
- **Never** `401 Missing authorization header`

## 4) Stripe Dashboard webhook setup

Webhook URL:

`https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`

Recommended events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `invoice.paid`

Notes:
- Stripe “Events” (in the left nav) are not the same as **webhook deliveries**. Your webhook endpoint only receives the event types you explicitly enable.
- For subscriptions, some setups commonly deliver `invoice.paid` reliably, while `invoice.payment_succeeded` may not be enabled or may be less consistent depending on your endpoint selection. This project handles both (and treats `invoice.paid` as a success signal).

## 5) Debug flow: “Stripe paid but app still Free”

### Step A — Confirm Stripe has a real active subscription

In Stripe Dashboard (test mode):
- Customer → Subscriptions → confirm status `active` or `trialing`
- Copy:
  - `customer` id (`cus_...`)
  - `subscription` id (`sub_...`)

### Step B — Confirm Supabase profile state

Run in Supabase SQL editor:

```sql
select
  id,
  email,
  subscription_plan,
  subscription_status,
  current_period_end,
  stripe_customer_id,
  stripe_subscription_id
from public.profiles
where email = 'ceyrix143@gmail.com';
```

If `stripe_customer_id` is set but `stripe_subscription_id` is NULL after payment, the webhook did not map/update the correct profile.

### Step C — Resend the Stripe event & check Supabase logs

In Stripe → Developers → Webhooks → click the failed/success delivery → **Resend**

Then check Supabase Edge Function logs for `stripe-webhook`.

Expected logs (examples):
- event type + id
- customer id (`cus_...`) and subscription id (`sub_...`)
- `subscription.metadata.user_id` and resolved `userId`
- price id and mapped plan
- “profile updated” showing the updated profile id
- `unhandled event type` logs for non-entitlement events (e.g. `payment_intent.*`) — these are ACKed with 200 but do not update DB

Important: The webhook returns **HTTP 500** when it cannot map/update exactly 1 profile row, so Stripe will retry until it succeeds.

## 6) Useful queries

Profiles with a Stripe customer id but missing subscription id:

```sql
select id, email, stripe_customer_id, stripe_subscription_id, subscription_plan, subscription_status
from public.profiles
where stripe_customer_id is not null
  and stripe_subscription_id is null
order by email;
```

If you applied migration `supabase/migrations/0007_profiles_billing_guardrails.sql`, you can also use:

```sql
select * from public.profile_billing_health order by email;
```
