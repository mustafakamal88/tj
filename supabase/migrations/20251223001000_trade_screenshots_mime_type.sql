-- Add optional mime_type to trade_screenshots for richer metadata.
-- Non-destructive.

begin;

alter table public.trade_screenshots
  add column if not exists mime_type text;

commit;
