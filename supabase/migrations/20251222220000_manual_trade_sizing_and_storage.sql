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

create table if not exists public.trade_screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  path text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

do $$
begin
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
end$$;

create index if not exists trade_screenshots_user_id_idx on public.trade_screenshots (user_id);
create index if not exists trade_screenshots_trade_id_idx on public.trade_screenshots (trade_id);

alter table public.trade_screenshots enable row level security;

drop policy if exists "trade_screenshots_select_own" on public.trade_screenshots;
create policy "trade_screenshots_select_own"
on public.trade_screenshots
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "trade_screenshots_insert_own" on public.trade_screenshots;
create policy "trade_screenshots_insert_own"
on public.trade_screenshots
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "trade_screenshots_delete_own" on public.trade_screenshots;
create policy "trade_screenshots_delete_own"
on public.trade_screenshots
for delete
to authenticated
using (user_id = auth.uid());

-- Automatically increment cached usage when a screenshot row is inserted.
create or replace function public.handle_trade_screenshot_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set storage_used_bytes = storage_used_bytes + new.size_bytes
  where id = new.user_id;
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

-- Restrict to paths like: <userId>/trades/<tradeId>/<file>
drop policy if exists "trade_screenshots_objects_select_own" on storage.objects;
create policy "trade_screenshots_objects_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trade-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
  and (storage.foldername(name))[2] = 'trades'
);

drop policy if exists "trade_screenshots_objects_insert_own" on storage.objects;
create policy "trade_screenshots_objects_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trade-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
  and (storage.foldername(name))[2] = 'trades'
);

drop policy if exists "trade_screenshots_objects_delete_own" on storage.objects;
create policy "trade_screenshots_objects_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'trade-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
  and (storage.foldername(name))[2] = 'trades'
);

commit;

