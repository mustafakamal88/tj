-- Import runs history

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  provider text not null,
  status text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  imported_count int not null default 0,
  updated_count int not null default 0,
  skipped_count int not null default 0,
  error_message text,
  error_details jsonb,
  created_at timestamptz not null default now(),

  constraint import_runs_source_check check (source in ('broker','csv')),
  constraint import_runs_status_check check (status in ('running','success','failed'))
);

alter table public.import_runs enable row level security;

drop policy if exists "import_runs_select_own" on public.import_runs;
create policy "import_runs_select_own"
  on public.import_runs
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "import_runs_insert_own" on public.import_runs;
create policy "import_runs_insert_own"
  on public.import_runs
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "import_runs_update_own" on public.import_runs;
create policy "import_runs_update_own"
  on public.import_runs
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
