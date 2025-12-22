-- Ensure screenshot storage-check SELECTs succeed under RLS.
-- - profiles: allow authenticated users to SELECT their own subscription_plan + storage_used_bytes
-- - trade_screenshots: allow SELECT only for screenshots belonging to trades the user owns

begin;

-- PROFILES
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- TRADE_SCREENSHOTS
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

commit;
