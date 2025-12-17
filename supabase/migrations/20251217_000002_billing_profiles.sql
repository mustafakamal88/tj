-- Billing profile fields + security hardening

-- Add billing fields to profiles
alter table public.profiles
  add column if not exists subscription_status text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists paypal_subscription_id text,
  add column if not exists current_period_end timestamptz;

-- Ensure can_add_trade always allows active paid plans
create or replace function public.can_add_trade()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    case
      when (select p.subscription_plan from public.profiles p where p.id = auth.uid()) in ('pro','premium') then true
      when now() - (select p.trial_start_at from public.profiles p where p.id = auth.uid()) <= interval '14 days'
        and (select count(*) from public.trades t where t.user_id = auth.uid()) < 15
        then true
      else false
    end;
$$;

-- Prevent users from self-upgrading by writing subscription columns directly.
-- Keep updates for safe fields only; billing updates must be done by service_role via Edge Functions.
revoke update (subscription_plan, subscription_status, stripe_customer_id, stripe_subscription_id, paypal_subscription_id, current_period_end)
  on table public.profiles from authenticated;

