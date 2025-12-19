-- Billing guardrails for public.profiles (non-destructive).
-- Goal: keep subscription state consistent and prevent bad states.

begin;

-- Normalize plan/status casing (safe: only changes values, does not change schema).
update public.profiles
set subscription_plan = lower(subscription_plan)
where subscription_plan is not null and subscription_plan <> lower(subscription_plan);

update public.profiles
set subscription_status = lower(subscription_status)
where subscription_status is not null and subscription_status <> lower(subscription_status);

-- Default plan should always be free.
alter table public.profiles
  alter column subscription_plan set default 'free';

-- Safety: ensure no NULL plan values remain (should be rare).
update public.profiles
set subscription_plan = 'free'
where subscription_plan is null;

-- Enforce valid plan values (do not fail existing rows): NOT VALID.
alter table public.profiles
  drop constraint if exists profiles_subscription_plan_check;

alter table public.profiles
  add constraint profiles_subscription_plan_check
  check (subscription_plan in ('free','pro','premium'))
  not valid;

-- Enforce valid status values (Stripe + existing app values). NOT VALID to avoid breaking existing rows.
alter table public.profiles
  drop constraint if exists profiles_subscription_status_check;

alter table public.profiles
  add constraint profiles_subscription_status_check
  check (
    subscription_status is null
    or subscription_status in (
      'active',
      'trialing',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'unpaid',
      'paused',
      'inactive'
    )
  )
  not valid;

-- Consistency rules (NOT VALID; validate after cleanup).
alter table public.profiles
  drop constraint if exists profiles_paid_plan_requires_stripe_customer_id;

alter table public.profiles
  add constraint profiles_paid_plan_requires_stripe_customer_id
  check (subscription_plan = 'free' or stripe_customer_id is not null)
  not valid;

alter table public.profiles
  drop constraint if exists profiles_active_requires_stripe_subscription_id;

alter table public.profiles
  add constraint profiles_active_requires_stripe_subscription_id
  check (subscription_status is distinct from 'active' or stripe_subscription_id is not null)
  not valid;

alter table public.profiles
  drop constraint if exists profiles_free_plan_requires_null_stripe_subscription_id;

alter table public.profiles
  add constraint profiles_free_plan_requires_null_stripe_subscription_id
  check (subscription_plan <> 'free' or stripe_subscription_id is null)
  not valid;

-- Unique Stripe identifiers (skip creation if duplicates exist to avoid breaking migrations).
do $$
begin
  if to_regclass('public.profiles_stripe_customer_id_uniq') is null then
    if exists (
      select 1
      from public.profiles
      where stripe_customer_id is not null
      group by stripe_customer_id
      having count(*) > 1
    ) then
      raise notice 'Skipping unique index profiles_stripe_customer_id_uniq: duplicates exist';
    else
      execute 'create unique index profiles_stripe_customer_id_uniq on public.profiles(stripe_customer_id) where stripe_customer_id is not null';
    end if;
  end if;

  if to_regclass('public.profiles_stripe_subscription_id_uniq') is null then
    if exists (
      select 1
      from public.profiles
      where stripe_subscription_id is not null
      group by stripe_subscription_id
      having count(*) > 1
    ) then
      raise notice 'Skipping unique index profiles_stripe_subscription_id_uniq: duplicates exist';
    else
      execute 'create unique index profiles_stripe_subscription_id_uniq on public.profiles(stripe_subscription_id) where stripe_subscription_id is not null';
    end if;
  end if;
end $$;

-- Verification view: shows rows with billing inconsistencies / violations.
create or replace view public.profile_billing_health as
with dup_customer as (
  select stripe_customer_id
  from public.profiles
  where stripe_customer_id is not null
  group by stripe_customer_id
  having count(*) > 1
),
dup_subscription as (
  select stripe_subscription_id
  from public.profiles
  where stripe_subscription_id is not null
  group by stripe_subscription_id
  having count(*) > 1
)
select
  p.id,
  p.email,
  p.subscription_plan,
  p.subscription_status,
  p.current_period_end,
  p.stripe_customer_id,
  p.stripe_subscription_id,
  array_remove(array[
    case when p.subscription_plan is null or p.subscription_plan not in ('free','pro','premium') then 'invalid_plan' end,
    case when p.subscription_status is not null and p.subscription_status not in (
      'active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid','paused','inactive'
    ) then 'invalid_status' end,
    case when p.subscription_plan <> 'free' and p.stripe_customer_id is null then 'paid_missing_customer_id' end,
    case when p.subscription_status = 'active' and p.stripe_subscription_id is null then 'active_missing_subscription_id' end,
    case when p.subscription_plan = 'free' and p.stripe_subscription_id is not null then 'free_has_subscription_id' end,
    case when p.subscription_status in ('active','trialing') and p.current_period_end is null then 'missing_current_period_end' end,
    case when dc.stripe_customer_id is not null then 'duplicate_stripe_customer_id' end,
    case when ds.stripe_subscription_id is not null then 'duplicate_stripe_subscription_id' end
  ], null) as issues
from public.profiles p
left join dup_customer dc on dc.stripe_customer_id = p.stripe_customer_id
left join dup_subscription ds on ds.stripe_subscription_id = p.stripe_subscription_id
where cardinality(
  array_remove(array[
    case when p.subscription_plan is null or p.subscription_plan not in ('free','pro','premium') then 'invalid_plan' end,
    case when p.subscription_status is not null and p.subscription_status not in (
      'active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid','paused','inactive'
    ) then 'invalid_status' end,
    case when p.subscription_plan <> 'free' and p.stripe_customer_id is null then 'paid_missing_customer_id' end,
    case when p.subscription_status = 'active' and p.stripe_subscription_id is null then 'active_missing_subscription_id' end,
    case when p.subscription_plan = 'free' and p.stripe_subscription_id is not null then 'free_has_subscription_id' end,
    case when p.subscription_status in ('active','trialing') and p.current_period_end is null then 'missing_current_period_end' end,
    case when dc.stripe_customer_id is not null then 'duplicate_stripe_customer_id' end,
    case when ds.stripe_subscription_id is not null then 'duplicate_stripe_subscription_id' end
  ], null)
) > 0;

commit;

