-- Run this in the Supabase SQL editor to create the tables + RLS policies used by the app.
-- Requires: Email/Password auth enabled in Supabase Auth settings.

-- Extensions
create extension if not exists pgcrypto;

-- Profiles (one row per auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  subscription_plan text not null default 'free' check (subscription_plan in ('free', 'pro', 'premium')),
  trial_start_at timestamptz not null default now(),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trades (scoped per user)
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

-- Create profile row automatically on signup
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
create or replace function public.can_add_trade()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    case
      when (select p.subscription_plan from public.profiles p where p.id = auth.uid()) <> 'free' then true
      when now() - (select p.trial_start_at from public.profiles p where p.id = auth.uid()) <= interval '14 days'
        and (select count(*) from public.trades t where t.user_id = auth.uid()) < 15
        then true
      else false
    end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.trades enable row level security;

-- Broker connections (one per account / connection)
create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  broker text not null default 'mt5',
  account_login bigint not null,
  api_key_hash text not null, -- store crypt() hash, never plaintext
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (broker, account_login)
);

create index if not exists broker_connections_user_idx
  on public.broker_connections(user_id);

-- External mapping to avoid duplicate trade imports
create table if not exists public.trade_external_map (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  broker text not null default 'mt5',
  account_login bigint not null,
  external_ticket bigint not null,
  trade_id uuid not null references public.trades(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, broker, account_login, external_ticket)
);

drop trigger if exists set_broker_connections_updated_at on public.broker_connections;
create trigger set_broker_connections_updated_at
before update on public.broker_connections
for each row execute function public.set_updated_at();

-- RLS
alter table public.broker_connections enable row level security;
alter table public.trade_external_map enable row level security;

-- Policies (owner only)
drop policy if exists "broker_connections_select_own" on public.broker_connections;
create policy "broker_connections_select_own"
on public.broker_connections
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "broker_connections_insert_own" on public.broker_connections;
create policy "broker_connections_insert_own"
on public.broker_connections
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "broker_connections_update_own" on public.broker_connections;
create policy "broker_connections_update_own"
on public.broker_connections
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "broker_connections_delete_own" on public.broker_connections;
create policy "broker_connections_delete_own"
on public.broker_connections
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "trade_external_map_select_own" on public.trade_external_map;
create policy "trade_external_map_select_own"
on public.trade_external_map
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "trade_external_map_insert_own" on public.trade_external_map;
create policy "trade_external_map_insert_own"
on public.trade_external_map
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "trade_external_map_delete_own" on public.trade_external_map;
create policy "trade_external_map_delete_own"
on public.trade_external_map
for delete to authenticated
using (user_id = auth.uid());

-- EA key helpers (pgcrypto)
create or replace function public.verify_ea_key(p_plain text, p_hash text)
returns boolean
language sql
stable
set search_path = public
as $$
  -- `crypt` is provided by pgcrypto and lives in the `extensions` schema on Supabase.
  select (extensions.crypt(p_plain, p_hash) = p_hash);
$$;

create or replace function public.hash_ea_key(p_plain text)
returns text
language sql
stable
set search_path = public
as $$
  -- `crypt`/`gen_salt` are provided by pgcrypto and live in the `extensions` schema on Supabase.
  select extensions.crypt(p_plain, extensions.gen_salt('bf'));
$$;

-- Profiles policies (self only)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Trades policies (self only, gated inserts for free)
drop policy if exists "trades_select_own" on public.trades;
create policy "trades_select_own"
on public.trades
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "trades_insert_own_gated" on public.trades;
create policy "trades_insert_own_gated"
on public.trades
for insert
to authenticated
with check (user_id = auth.uid() and public.can_add_trade());

drop policy if exists "trades_update_own" on public.trades;
create policy "trades_update_own"
on public.trades
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "trades_delete_own" on public.trades;
create policy "trades_delete_own"
on public.trades
for delete
to authenticated
using (user_id = auth.uid());
