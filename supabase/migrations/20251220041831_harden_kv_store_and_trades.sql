-- Harden KV store + ensure MT sync trade upserts have the required schema.
-- Non-destructive: uses IF NOT EXISTS and avoids dropping data.

begin;

-- ---------------------------------------------------------------------------
-- 1) KV store hardening: enable RLS + deny anon/authenticated access
-- ---------------------------------------------------------------------------

-- Ensure table exists (created previously by 0008_kv_store_a46fa5d6.sql, but keep safe).
create table if not exists public.kv_store_a46fa5d6 (
  key text primary key,
  value jsonb not null
);

-- Enable Row Level Security.
alter table public.kv_store_a46fa5d6 enable row level security;

-- Remove any existing policies (idempotent).
drop policy if exists "kv_store_deny_anon" on public.kv_store_a46fa5d6;
drop policy if exists "kv_store_deny_authenticated" on public.kv_store_a46fa5d6;
drop policy if exists "kv_store_allow_service_role" on public.kv_store_a46fa5d6;

-- Deny all access for client roles.
create policy "kv_store_deny_anon"
on public.kv_store_a46fa5d6
for all
to anon
using (false)
with check (false);

create policy "kv_store_deny_authenticated"
on public.kv_store_a46fa5d6
for all
to authenticated
using (false)
with check (false);

-- Allow service_role (Edge Functions) full access.
create policy "kv_store_allow_service_role"
on public.kv_store_a46fa5d6
for all
to service_role
using (true)
with check (true);

-- Also harden table privileges: revoke for client roles, grant to service_role.
revoke all on table public.kv_store_a46fa5d6 from anon;
revoke all on table public.kv_store_a46fa5d6 from authenticated;
grant all on table public.kv_store_a46fa5d6 to service_role;

-- ---------------------------------------------------------------------------
-- 2) Profiles: ensure required subscription columns exist (safe)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists subscription_plan text not null default 'free',
  add column if not exists trial_start_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3) Trades: ensure MT sync upsert columns exist + required index
-- ---------------------------------------------------------------------------

-- Ensure table exists (created previously by 0002_profiles_trades.sql, but keep safe).
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  symbol text not null,
  type text not null,
  entry numeric not null,
  exit numeric not null,
  quantity numeric not null,
  outcome text not null,
  pnl numeric not null,
  pnl_percentage numeric not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trades
  add column if not exists user_id uuid,
  add column if not exists date date,
  add column if not exists symbol text,
  add column if not exists type text,
  add column if not exists entry numeric,
  add column if not exists exit numeric,
  add column if not exists quantity numeric,
  add column if not exists outcome text,
  add column if not exists pnl numeric,
  add column if not exists pnl_percentage numeric,
  add column if not exists notes text;

create index if not exists trades_user_id_idx on public.trades (user_id);
create index if not exists trades_user_date_idx on public.trades (user_id, date desc);

commit;
