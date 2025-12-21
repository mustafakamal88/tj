-- MetaApi broker import support (connections + idempotent trade upserts).
-- Non-destructive: adds columns/indexes/tables/policies safely.

begin;

-- ---------------------------------------------------------------------------
-- 1) Trades: broker import fields + indexes
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

-- Retire old MT sync unique index (EA connector) if present.
drop index if exists trades_user_account_ticket_uidx;

-- Idempotency for broker imports (one row per MetaApi deal/position key).
-- We expect broker_provider/account_login/position_id/ticket to be set for broker-imported trades.
create unique index if not exists trades_user_broker_ticket_uidx
  on public.trades (user_id, broker_provider, account_login, position_id, ticket);

-- Fast month-range queries for calendar (timestamptz).
create index if not exists trades_user_close_time_idx
  on public.trades (user_id, close_time desc);

-- Keep the existing date index for manual trades/legacy queries.
create index if not exists trades_user_date_idx
  on public.trades (user_id, date desc);

-- ---------------------------------------------------------------------------
-- 2) Broker connections: store MetaApi account ids (never store passwords)
-- ---------------------------------------------------------------------------
--
-- NOTE: This repo previously used public.broker_connections for the EA connector flow
-- (account_login/api_key_hash). We keep the table and data, but make it compatible with
-- MetaApi connections by:
-- - relaxing old NOT NULL constraints for EA-only columns
-- - adding MetaApi-specific columns

-- Allow MetaApi rows without EA-only fields.
alter table public.broker_connections
  alter column account_login drop not null,
  alter column api_key_hash drop not null;

alter table public.broker_connections
  add column if not exists provider text,
  add column if not exists metaapi_account_id text,
  add column if not exists server text,
  add column if not exists login text,
  add column if not exists account_type text,
  add column if not exists status text,
  add column if not exists last_import_at timestamptz;

-- Uniqueness for MetaApi account ids (NULL allowed for legacy EA rows).
create unique index if not exists broker_connections_metaapi_account_uidx
  on public.broker_connections (metaapi_account_id)
  where metaapi_account_id is not null;

-- Ensure RLS remains enabled (policies are defined in earlier migrations).
alter table public.broker_connections enable row level security;

commit;
