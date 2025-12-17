-- RLS policies: users can read/update only their own rows.
-- Non-destructive: drops/recreates named policies.

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.trades enable row level security;
alter table public.subscriptions enable row level security;
alter table public.broker_connections enable row level security;
alter table public.trade_external_map enable row level security;

-- PROFILES (self only)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own_safe" on public.profiles;
create policy "profiles_update_own_safe"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Prevent client-side self-upgrade: service_role/admin RPC should be used for billing fields.
revoke update (subscription_plan, subscription_status, current_period_end, stripe_customer_id, stripe_subscription_id, paypal_subscription_id, is_admin)
  on table public.profiles from authenticated;

-- TRADES (self only; inserts gated by can_add_trade)
drop policy if exists "trades_select_own" on public.trades;
create policy "trades_select_own"
on public.trades
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "trades_insert_own_gated" on public.trades;
create policy "trades_insert_own_gated"
on public.trades
for insert
to authenticated
with check (user_id = auth.uid() and public.can_add_trade());

drop policy if exists "trades_update_own" on public.trades;
create policy "trades_update_own"
on public.trades
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "trades_delete_own" on public.trades;
create policy "trades_delete_own"
on public.trades
for delete
to authenticated
using (user_id = auth.uid());

-- SUBSCRIPTIONS (read-only for users; writes via service_role)
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
on public.subscriptions
for select to authenticated
using (user_id = auth.uid());

-- BROKER CONNECTIONS (owner only)
drop policy if exists "broker_connections_select_own" on public.broker_connections;
create policy "broker_connections_select_own"
on public.broker_connections
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "broker_connections_insert_own" on public.broker_connections;
create policy "broker_connections_insert_own"
on public.broker_connections
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "broker_connections_update_own" on public.broker_connections;
create policy "broker_connections_update_own"
on public.broker_connections
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "broker_connections_delete_own" on public.broker_connections;
create policy "broker_connections_delete_own"
on public.broker_connections
for delete to authenticated
using (user_id = auth.uid());

-- trade_external_map (owner only)
drop policy if exists "trade_external_map_select_own" on public.trade_external_map;
create policy "trade_external_map_select_own"
on public.trade_external_map
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "trade_external_map_insert_own" on public.trade_external_map;
create policy "trade_external_map_insert_own"
on public.trade_external_map
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "trade_external_map_delete_own" on public.trade_external_map;
create policy "trade_external_map_delete_own"
on public.trade_external_map
for delete to authenticated
using (user_id = auth.uid());

