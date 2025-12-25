-- Live broker state table for realtime broker/account metrics

create table if not exists public.broker_live_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null,
  account_id text not null,
  status text not null default 'syncing',
  last_sync_at timestamptz not null default now(),
  equity numeric,
  balance numeric,
  floating_pnl numeric,
  open_positions_count int,
  margin_used numeric,
  free_margin numeric,
  exposure jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),

  constraint broker_live_state_status_check check (status in ('live','syncing','error','stale')),
  constraint broker_live_state_user_broker_account_unique unique (user_id, broker, account_id)
);

create index if not exists broker_live_state_user_idx on public.broker_live_state (user_id);
create index if not exists broker_live_state_user_updated_at_idx on public.broker_live_state (user_id, updated_at desc);

-- updated_at trigger reuse
drop trigger if exists set_broker_live_state_updated_at on public.broker_live_state;
create trigger set_broker_live_state_updated_at
before update on public.broker_live_state
for each row execute function public.set_updated_at();

alter table public.broker_live_state enable row level security;

-- Allow authenticated users to read only their own rows.
drop policy if exists "broker_live_state_select_own" on public.broker_live_state;
create policy "broker_live_state_select_own"
  on public.broker_live_state
  for select
  to authenticated
  using (user_id = auth.uid());

-- No client insert/update/delete policies; writes come from server-side edge function only.

-- Realtime publication (best-effort; some environments manage this via dashboard)
do $$
begin
  alter publication supabase_realtime add table public.broker_live_state;
exception
  when undefined_object then
    -- publication not present in this environment
    null;
  when duplicate_object then
    null;
end $$;
