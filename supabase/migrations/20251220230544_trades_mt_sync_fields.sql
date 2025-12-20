-- MT sync fields + calendar performance indexes.
-- Non-destructive: adds columns/indexes only.

begin;

-- Add broker-sync columns (nullable for manual trades/imports).
alter table public.trades
  add column if not exists account_login bigint,
  add column if not exists ticket bigint,
  add column if not exists position_id bigint,
  add column if not exists open_time timestamptz,
  add column if not exists close_time timestamptz,
  add column if not exists commission numeric,
  add column if not exists swap numeric;

-- Prevent duplicate ticket inserts per user+account (NULL tickets are allowed multiple times).
drop index if exists trades_user_ticket_uidx;
create unique index if not exists trades_user_account_ticket_uidx
  on public.trades (user_id, account_login, ticket);

-- Fast month-range queries for calendar (timestamptz).
create index if not exists trades_user_close_time_idx
  on public.trades (user_id, close_time desc);

commit;
