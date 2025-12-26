-- Ensure broker_live_state is never empty when broker connections exist.
-- Adds client insert/update policies and an RPC to seed missing rows.

-- Extra lookup index for dashboard queries.
create index if not exists broker_live_state_user_broker_idx
  on public.broker_live_state (user_id, broker);

alter table public.broker_live_state enable row level security;

-- RLS policies: authenticated users can select/insert/update only their own rows.
-- (Anon has no policies.)

drop policy if exists "broker_live_state_select_own" on public.broker_live_state;
drop policy if exists "broker_live_state_insert_own" on public.broker_live_state;
drop policy if exists "broker_live_state_update_own" on public.broker_live_state;

create policy "broker_live_state_select_own"
  on public.broker_live_state
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "broker_live_state_insert_own"
  on public.broker_live_state
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "broker_live_state_update_own"
  on public.broker_live_state
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- RPC: inserts missing live-state rows based on broker_connections, then returns current rows.
-- Uses SECURITY INVOKER so RLS still applies (user can only affect their own rows).
create or replace function public.ensure_broker_live_state()
returns setof public.broker_live_state
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.broker_live_state (user_id, broker, account_id, status, last_sync_at, updated_at)
  select
    auth.uid() as user_id,
    bc.provider as broker,
    bc.metaapi_account_id as account_id,
    'syncing'::text as status,
    now() as last_sync_at,
    now() as updated_at
  from public.broker_connections bc
  where bc.user_id = auth.uid()
    and bc.metaapi_account_id is not null
  on conflict (user_id, broker, account_id) do nothing;

  return query
  select *
  from public.broker_live_state
  where user_id = auth.uid()
  order by updated_at desc;
end;
$$;

grant execute on function public.ensure_broker_live_state() to authenticated;
