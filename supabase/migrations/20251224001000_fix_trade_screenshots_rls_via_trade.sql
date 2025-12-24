-- Fix trade_screenshots RLS to authorize via related trade ownership (no trade_screenshots.user_id)

begin;

-- Drop legacy artifacts that referenced trade_screenshots.user_id (some deployments do not have this column).

drop index if exists public.trade_screenshots_user_id_idx;

-- Replace trade_screenshots policies to use trade ownership only.
alter table public.trade_screenshots enable row level security;

-- (Names may have been created with or without quotes; actual name is lower-case either way.)
drop policy if exists trade_screenshots_select_own on public.trade_screenshots;
drop policy if exists trade_screenshots_insert_own on public.trade_screenshots;
drop policy if exists trade_screenshots_delete_own on public.trade_screenshots;

drop policy if exists "trade_screenshots_select_own" on public.trade_screenshots;
drop policy if exists "trade_screenshots_insert_own" on public.trade_screenshots;
drop policy if exists "trade_screenshots_delete_own" on public.trade_screenshots;

create policy trade_screenshots_select_own
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

create policy trade_screenshots_insert_own
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
);

create policy trade_screenshots_delete_own
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

-- Fix cached storage usage increment trigger to derive user_id from the referenced trade.
create or replace function public.handle_trade_screenshot_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select t.user_id
    into v_user_id
    from public.trades t
   where t.id = new.trade_id;

  if v_user_id is null then
    return new;
  end if;

  if new.size_bytes is not null then
    update public.profiles
       set storage_used_bytes = coalesce(storage_used_bytes, 0) + new.size_bytes
     where id = v_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trade_screenshots_after_insert on public.trade_screenshots;
create trigger trade_screenshots_after_insert
after insert on public.trade_screenshots
for each row execute function public.handle_trade_screenshot_insert();

commit;
