-- Broker connections: add demo/live environment + platform for MetaApi imports.
-- Non-destructive: adds columns/indexes/constraints safely.

begin;

-- Ensure MetaApi columns exist (safe to re-run even if older migrations were skipped remotely).
alter table public.broker_connections
  add column if not exists provider text,
  add column if not exists metaapi_account_id text,
  add column if not exists server text,
  add column if not exists login text,
  add column if not exists status text,
  add column if not exists last_import_at timestamptz,
  add column if not exists platform text,
  add column if not exists environment text;

-- Allow MetaApi rows without legacy EA-only fields.
alter table public.broker_connections
  alter column account_login drop not null,
  alter column api_key_hash drop not null;

-- Provider: this repo now uses MetaApi only.
update public.broker_connections
set provider = 'metaapi'
where provider is null or provider <> 'metaapi';

alter table public.broker_connections
  alter column provider set default 'metaapi',
  alter column provider set not null;

-- Platform and environment: used by UI and stored for clarity.
update public.broker_connections
set platform = coalesce(platform, 'mt5');

update public.broker_connections
set environment = coalesce(environment, 'demo');

alter table public.broker_connections
  alter column platform set default 'mt5',
  alter column platform set not null,
  alter column environment set default 'demo',
  alter column environment set not null;

-- Constraints (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'broker_connections'
      and c.conname = 'broker_connections_provider_check'
  ) then
    alter table public.broker_connections
      add constraint broker_connections_provider_check
      check (provider in ('metaapi'));
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'broker_connections'
      and c.conname = 'broker_connections_platform_check'
  ) then
    alter table public.broker_connections
      add constraint broker_connections_platform_check
      check (platform in ('mt4','mt5'));
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'broker_connections'
      and c.conname = 'broker_connections_environment_check'
  ) then
    alter table public.broker_connections
      add constraint broker_connections_environment_check
      check (environment in ('demo','live'));
  end if;
end $$;

-- Uniqueness for MetaApi account ids (NULL allowed for rows without MetaApi linkage).
create unique index if not exists broker_connections_metaapi_account_uidx
  on public.broker_connections (metaapi_account_id)
  where metaapi_account_id is not null;

-- Ensure updated_at is maintained.
drop trigger if exists set_broker_connections_updated_at on public.broker_connections;
create trigger set_broker_connections_updated_at
before update on public.broker_connections
for each row execute function public.set_updated_at();

-- RLS: owner-only access (service_role bypasses RLS for Edge Functions).
alter table public.broker_connections enable row level security;

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

commit;

