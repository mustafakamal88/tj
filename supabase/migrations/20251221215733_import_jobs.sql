-- Background import jobs (broker history imports without timeouts).
-- Users can read their own jobs; only service_role can write/update (RLS enforced).

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.broker_connections(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  progress int not null default 0,
  total int not null default 0,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists import_jobs_user_idx on public.import_jobs(user_id);
create index if not exists import_jobs_user_updated_idx on public.import_jobs(user_id, updated_at desc);

-- updated_at trigger reuse
drop trigger if exists set_import_jobs_updated_at on public.import_jobs;
create trigger set_import_jobs_updated_at
before update on public.import_jobs
for each row execute function public.set_updated_at();

alter table public.import_jobs enable row level security;

drop policy if exists "import_jobs_select_own" on public.import_jobs;
create policy "import_jobs_select_own"
on public.import_jobs
for select
to authenticated
using (user_id = auth.uid());

