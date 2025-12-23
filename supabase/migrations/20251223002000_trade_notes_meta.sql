-- Add JSON meta to trade_notes for per-trade journaling fields (emotions/mistakes)

begin;

alter table public.trade_notes
  add column if not exists meta jsonb;

-- Keep defaults lightweight; clients can write partial shapes.
alter table public.trade_notes
  alter column meta set default '{}'::jsonb;

commit;
