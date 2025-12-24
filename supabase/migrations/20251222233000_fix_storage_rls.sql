-- Fix screenshot storage-check RLS + harden screenshot metadata ownership.
-- Scope: profiles (read own plan/usage) + trade_screenshots (read/insert/delete only for trades the user owns).

begin;

-- Ensure Profiles RLS and self-select policy exist.
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- Harden trade_screenshots policies to require ownership of the referenced trade.
alter table public.trade_screenshots enable row level security;

drop policy if exists "trade_screenshots_select_own" on public.trade_screenshots;
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
);

drop policy if exists "trade_screenshots_insert_own" on public.trade_screenshots;
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
      create policy "trade_screenshots_insert_own"
      on public.trade_screenshots
      for insert
      to authenticated
      with check (
        user_id = auth.uid()
        and exists (
          select 1
          from public.trades t
          where t.id = trade_screenshots.trade_id
            and t.user_id = auth.uid()
        )
      )
    $p$;
  else
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
  end if;
end$$;

drop policy if exists "trade_screenshots_delete_own" on public.trade_screenshots;
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
);

commit;
