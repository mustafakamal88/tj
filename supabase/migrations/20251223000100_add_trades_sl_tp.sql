-- Add optional stop loss / take profit fields to trades (nullable)

begin;

alter table public.trades
  add column if not exists stop_loss numeric,
  add column if not exists take_profit numeric;

commit;
