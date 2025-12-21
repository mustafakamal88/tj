-- MT sync fields (text ids) + calendar performance indexes.
-- Non-destructive: adds columns/indexes and coerces existing BIGINT ids to TEXT when present.

begin;

-- Add broker-sync columns (nullable for manual trades/imports).
alter table public.trades
  add column if not exists account_login text,
  add column if not exists ticket text,
  add column if not exists position_id text,
  add column if not exists open_time timestamptz,
  add column if not exists close_time timestamptz,
  add column if not exists commission numeric,
  add column if not exists swap numeric;

-- If older migrations created these IDs as BIGINT, coerce to TEXT safely.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'trades'
      and column_name = 'account_login'
      and data_type <> 'text'
  ) then
    alter table public.trades
      alter column account_login type text using account_login::text;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'trades'
      and column_name = 'ticket'
      and data_type <> 'text'
  ) then
    alter table public.trades
      alter column ticket type text using ticket::text;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'trades'
      and column_name = 'position_id'
      and data_type <> 'text'
  ) then
    alter table public.trades
      alter column position_id type text using position_id::text;
  end if;
end $$;

-- Idempotency for MT sync: ticket is stable; position_id can be NULL (MT4),
-- so we key on (user_id, account_login, ticket).
create unique index if not exists trades_user_account_ticket_uidx
  on public.trades (user_id, account_login, ticket);

-- Fast month-range queries for calendar (timestamptz).
create index if not exists trades_user_close_time_idx
  on public.trades (user_id, close_time desc);

commit;
