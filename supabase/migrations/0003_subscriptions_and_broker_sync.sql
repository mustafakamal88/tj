-- Subscriptions table (optional source-of-truth for providers) + broker sync tables.
-- Non-destructive.

-- SUBSCRIPTIONS
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro','premium')),
  status text not null default 'trialing' check (status in ('active','canceled','trialing','inactive')),
  current_period_end timestamptz,
  provider text not null default 'manual' check (provider in ('manual','stripe','paypal')),
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

-- BROKER CONNECTIONS
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

create index if not exists broker_connections_user_idx on public.broker_connections(user_id);

drop trigger if exists set_broker_connections_updated_at on public.broker_connections;
create trigger set_broker_connections_updated_at
before update on public.broker_connections
for each row execute function public.set_updated_at();

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

-- EA key helpers (pgcrypto is installed in extensions schema on Supabase)
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

