-- MetaApi broker import: schema hardening + idempotent trade upserts.
-- Non-destructive: adds columns/indexes/functions safely and keeps existing data.

begin;

-- ---------------------------------------------------------------------------
-- 1) broker_connections: ensure MetaApi fields + demo/live support
-- ---------------------------------------------------------------------------

alter table public.broker_connections
  add column if not exists provider text,
  add column if not exists platform text,
  add column if not exists environment text,
  add column if not exists server text,
  add column if not exists login text,
  add column if not exists metaapi_account_id text,
  add column if not exists status text,
  add column if not exists last_import_at timestamptz;

-- Defaults (safe for existing rows)
update public.broker_connections set provider = 'metaapi' where provider is null;
update public.broker_connections set platform = 'mt5' where platform is null;
update public.broker_connections set environment = 'demo' where environment is null;
update public.broker_connections set status = 'new' where status is null;

alter table public.broker_connections
  alter column provider set default 'metaapi',
  alter column platform set default 'mt5',
  alter column environment set default 'demo',
  alter column status set default 'new';

-- Constraints (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'broker_connections'
      and c.conname = 'broker_connections_platform_check'
  ) then
    alter table public.broker_connections
      add constraint broker_connections_platform_check
      check (platform in ('mt4','mt5'));
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'broker_connections'
      and c.conname = 'broker_connections_environment_check'
  ) then
    alter table public.broker_connections
      add constraint broker_connections_environment_check
      check (environment in ('demo','live'));
  end if;

  -- Ensure MetaApi rows have the identifying fields present.
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'broker_connections'
      and c.conname = 'broker_connections_metaapi_required_fields_check'
  ) then
    alter table public.broker_connections
      add constraint broker_connections_metaapi_required_fields_check
      check (
        provider <> 'metaapi'
        or (server is not null and login is not null)
      );
  end if;
end $$;

-- Uniqueness: prevent duplicate MetaApi connections for same user/login/server.
create unique index if not exists broker_connections_user_login_server_uidx
  on public.broker_connections (user_id, provider, login, server)
  where provider = 'metaapi' and login is not null and server is not null;

create index if not exists broker_connections_user_last_import_idx
  on public.broker_connections (user_id, last_import_at desc);

-- Keep updated_at maintained.
drop trigger if exists set_broker_connections_updated_at on public.broker_connections;
create trigger set_broker_connections_updated_at
before update on public.broker_connections
for each row execute function public.set_updated_at();

-- RLS: owner-only access (service_role bypasses RLS for Edge Functions).
alter table public.broker_connections enable row level security;

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

-- ---------------------------------------------------------------------------
-- 2) trades: MetaApi fields + calendar indexes + idempotency
-- ---------------------------------------------------------------------------

alter table public.trades
  add column if not exists broker_provider text,
  add column if not exists account_login text,
  add column if not exists ticket text,
  add column if not exists position_id text,
  add column if not exists open_time timestamptz,
  add column if not exists close_time timestamptz,
  add column if not exists commission numeric,
  add column if not exists swap numeric;

-- Ensure a deterministic default for non-broker/manual trades.
update public.trades set broker_provider = 'manual' where broker_provider is null;
alter table public.trades
  alter column broker_provider set default 'manual',
  alter column broker_provider set not null;

-- Drop the old non-partial broker unique index (if present) and replace with a MetaApi-only index.
drop index if exists trades_user_broker_ticket_uidx;

create unique index if not exists trades_metaapi_dedupe_uidx
  on public.trades (user_id, broker_provider, account_login, position_id, ticket)
  where broker_provider = 'metaapi';

create index if not exists trades_user_close_time_idx
  on public.trades (user_id, close_time desc);

-- ---------------------------------------------------------------------------
-- 3) RPC: server-side upsert for MetaApi trades (required for partial unique index)
-- ---------------------------------------------------------------------------

create or replace function public.upsert_metaapi_trades(p_trades jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with rows as (
    select *
    from jsonb_to_recordset(p_trades) as r(
      user_id uuid,
      broker_provider text,
      account_login text,
      position_id text,
      ticket text,
      open_time timestamptz,
      close_time timestamptz,
      commission numeric,
      swap numeric,
      date date,
      symbol text,
      type text,
      entry numeric,
      exit numeric,
      quantity numeric,
      outcome text,
      pnl numeric,
      pnl_percentage numeric,
      notes text
    )
  ),
  upserted as (
    insert into public.trades (
      user_id, broker_provider, account_login, position_id, ticket,
      open_time, close_time, commission, swap,
      date, symbol, type, entry, exit, quantity, outcome, pnl, pnl_percentage, notes
    )
    select
      user_id,
      coalesce(broker_provider, 'metaapi'),
      account_login,
      position_id,
      ticket,
      open_time,
      close_time,
      commission,
      swap,
      date,
      symbol,
      type,
      entry,
      exit,
      quantity,
      outcome,
      pnl,
      pnl_percentage,
      notes
    from rows
    on conflict (user_id, broker_provider, account_login, position_id, ticket)
      where broker_provider = 'metaapi'
    do update set
      open_time = excluded.open_time,
      close_time = excluded.close_time,
      commission = excluded.commission,
      swap = excluded.swap,
      date = excluded.date,
      symbol = excluded.symbol,
      type = excluded.type,
      entry = excluded.entry,
      exit = excluded.exit,
      quantity = excluded.quantity,
      outcome = excluded.outcome,
      pnl = excluded.pnl,
      pnl_percentage = excluded.pnl_percentage,
      notes = excluded.notes,
      updated_at = now()
    returning 1
  )
  select count(*)::int from upserted;
$$;

revoke all on function public.upsert_metaapi_trades(jsonb) from public;
grant execute on function public.upsert_metaapi_trades(jsonb) to service_role;

commit;

