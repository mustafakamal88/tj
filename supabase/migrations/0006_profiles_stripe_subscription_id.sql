-- Ensure Stripe subscription id column exists on profiles (non-destructive).
alter table public.profiles
  add column if not exists stripe_subscription_id text;

