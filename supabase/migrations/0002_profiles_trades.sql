-- Core tables: profiles + trades (+ helpers).
-- Non-destructive: uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS.

-- PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  subscription_plan text not null default 'free',
  subscription_status text,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  paypal_subscription_id text,
  trial_start_at timestamptz not null default now(),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists subscription_plan text not null default 'free',
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists paypal_subscription_id text,
  add column if not exists trial_start_at timestamptz not null default now(),
  add column if not exists is_admin boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Ensure subscription_plan constraint exists (supports existing premium data too).
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.conname = 'profiles_subscription_plan_check'
  ) then
    alter table public.profiles
      add constraint profiles_subscription_plan_check
      check (subscription_plan in ('free','pro','premium'));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.conname = 'profiles_subscription_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_subscription_status_check
      check (subscription_status is null or subscription_status in ('active','canceled','trialing','inactive'));
  end if;
end$$;

-- TRADES
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  symbol text not null,
  type text not null check (type in ('long', 'short')),
  entry numeric not null,
  exit numeric not null,
  quantity numeric not null,
  outcome text not null check (outcome in ('win', 'loss', 'breakeven')),
  pnl numeric not null,
  pnl_percentage numeric not null,
  notes text,
  emotions text,
  setup text,
  mistakes text,
  screenshots text[],
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trades_user_date_idx on public.trades (user_id, date desc);

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_trades_updated_at on public.trades;
create trigger set_trades_updated_at
before update on public.trades
for each row execute function public.set_updated_at();

-- Create profile row automatically on signup (safe to re-run)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Free-plan gate: 15 trades total OR 14 days (trial) for creating new trades.
-- Paid plans always allowed.
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

