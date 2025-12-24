-- Manual trade sizing + screenshot storage usage tracking.
-- Non-destructive: uses IF NOT EXISTS and avoids dropping data.

begin;

-- ---------------------------------------------------------------------------
-- 1) Trades: instrument-aware sizing fields (keep legacy quantity)
-- ---------------------------------------------------------------------------

alter table public.trades
  add column if not exists market text,
  add column if not exists size numeric,
  add column if not exists size_unit text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'trades'
      and c.conname = 'trades_market_check'
  ) then
    alter table public.trades
      add constraint trades_market_check
      check (market is null or market in ('forex_cfd','futures'));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'trades'
      and c.conname = 'trades_size_unit_check'
  ) then
    alter table public.trades
      add constraint trades_size_unit_check
      check (size_unit is null or size_unit in ('lots','contracts'));
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2) Profiles: cached screenshot storage usage (server-maintained)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists storage_used_bytes bigint not null default 0;

-- Prevent client-side tampering with cached usage.
revoke update (storage_used_bytes) on table public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- 3) Screenshot metadata table (size + path per upload)
-- ---------------------------------------------------------------------------

-- NOTE: This migration must work against both legacy schemas (trade_screenshots has user_id)
-- and newer schemas (no user_id; ownership is derived via trade_id -> trades.user_id).

create table if not exists public.trade_screenshots (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid references public.trades (id) on delete cascade,
  object_path text,
  path text,
  filename text,
  metadata jsonb,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

-- Ensure commonly-used columns exist across environments (non-destructive).
alter table public.trade_screenshots
  add column if not exists trade_id uuid,
  add column if not exists object_path text,
  add column if not exists path text,
  add column if not exists filename text,
  add column if not exists metadata jsonb,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists created_at timestamptz;

do $$
begin
  -- Add a non-breaking check constraint only if missing.
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
      check (size_bytes is null or size_bytes >= 0);
  end if;
end$$;

-- Indexes (create user_id index only if the column exists).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'trade_screenshots'
      and column_name = 'user_id'
  ) then
    execute 'create index if not exists trade_screenshots_user_id_idx on public.trade_screenshots (user_id)';
  end if;

  execute 'create index if not exists trade_screenshots_trade_id_idx on public.trade_screenshots (trade_id)';
end$$;

alter table public.trade_screenshots enable row level security;

-- Drop and recreate policies depending on schema.
drop policy if exists "trade_screenshots_select_own" on public.trade_screenshots;
drop policy if exists "trade_screenshots_insert_own" on public.trade_screenshots;
drop policy if exists "trade_screenshots_delete_own" on public.trade_screenshots;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'trade_screenshots'
      and column_name = 'user_id'
  ) then
    execute $p$
      create policy "trade_screenshots_select_own"
      on public.trade_screenshots
      for select
      to authenticated
      using (user_id = auth.uid())
    $p$;

    execute $p$
      create policy "trade_screenshots_insert_own"
      on public.trade_screenshots
      for insert
      to authenticated
      with check (user_id = auth.uid())
    $p$;

    execute $p$
      create policy "trade_screenshots_delete_own"
      on public.trade_screenshots
      for delete
      to authenticated
      using (user_id = auth.uid())
    $p$;
  else
    execute $p$
      create policy "trade_screenshots_select_own"
      on public.trade_screenshots
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.trades t
          where t.id = trade_screenshots.trade_id
            and t.user_id = auth.uid()
        )
      )
    $p$;

    execute $p$
      create policy "trade_screenshots_insert_own"
      on public.trade_screenshots
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.trades t
          where t.id = trade_screenshots.trade_id
            and t.user_id = auth.uid()
        )
      )
    $p$;

    execute $p$
      create policy "trade_screenshots_delete_own"
      on public.trade_screenshots
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.trades t
          where t.id = trade_screenshots.trade_id
            and t.user_id = auth.uid()
        )
      )
    $p$;
  end if;
end$$;

-- Automatically increment cached usage when a screenshot row is inserted.
create or replace function public.handle_trade_screenshot_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'trade_screenshots'
      and column_name = 'user_id'
  ) then
    owner_id := nullif(to_jsonb(new)->>'user_id', '')::uuid;
  else
    select t.user_id
      into owner_id
      from public.trades t
     where t.id = new.trade_id;
  end if;

  if owner_id is not null then
    update public.profiles
       set storage_used_bytes = coalesce(storage_used_bytes, 0) + coalesce(new.size_bytes, 0)
     where id = owner_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trade_screenshots_after_insert on public.trade_screenshots;
create trigger trade_screenshots_after_insert
after insert on public.trade_screenshots
for each row execute function public.handle_trade_screenshot_insert();

-- ---------------------------------------------------------------------------
-- 4) Storage bucket + policies (user-scoped paths)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('trade-screenshots', 'trade-screenshots', false)
on conflict (id) do nothing;

-- Restrict to paths like: <userId>/<tradeId>/<file>
drop policy if exists "trade_screenshots_objects_select_own" on storage.objects;
create policy "trade_screenshots_objects_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trade-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "trade_screenshots_objects_insert_own" on storage.objects;
create policy "trade_screenshots_objects_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trade-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "trade_screenshots_objects_delete_own" on storage.objects;
create policy "trade_screenshots_objects_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'trade-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);

commit;

