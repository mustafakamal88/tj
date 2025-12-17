-- Broker sync + MVP policies for TJ Trade Journal
-- Apply in Supabase SQL editor (or via Supabase CLI migrations).

-- Extensions required by crypt()/gen_salt().
-- In Supabase, extensions typically live in the `extensions` schema.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- updated_at helper (safe to re-run)
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

-- Profiles: allow the app to create its own row if missing.
alter table public.profiles enable row level security;
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

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

-- updated_at trigger reuse
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
set search_path = public, extensions
as $$
  select (crypt(p_plain, p_hash) = p_hash);
$$;

create or replace function public.hash_ea_key(p_plain text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select crypt(p_plain, gen_salt('bf'));
$$;
