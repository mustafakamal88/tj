-- Repair remote schema drift (idempotent):
-- - Ensure profiles.storage_used_bytes exists (bigint not null default 0)
-- - Ensure trade_screenshots.size_bytes exists (bigint)
-- - Backfill null size_bytes to 1
-- - Ensure check constraint exists: size_bytes > 0

begin;

-- -----------------------------------------------------------------------------
-- PROFILES: storage_used_bytes
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists storage_used_bytes bigint not null default 0;

-- -----------------------------------------------------------------------------
-- TRADE_SCREENSHOTS: size_bytes
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'trade_screenshots'
  ) then
    alter table public.trade_screenshots
      add column if not exists size_bytes bigint;

    -- Backfill any nulls so a >0 check is always true and easy to reason about.
    update public.trade_screenshots
    set size_bytes = 1
    where size_bytes is null;

    -- Add check constraint only if missing.
    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on c.conrelid = t.oid
      join pg_namespace n on t.relnamespace = n.oid
      where n.nspname = 'public'
        and t.relname = 'trade_screenshots'
        and c.conname = 'trade_screenshots_size_bytes_check'
    ) then
      alter table public.trade_screenshots
        add constraint trade_screenshots_size_bytes_check
        check (size_bytes > 0);
    end if;
  end if;
end$$;

commit;
