-- Day Journal and Trade Media Migration
-- This migration adds tables for day journals, trade notes, trade media (screenshots), and day news

-- ============================================
-- 1. Day Journals Table
-- ============================================
create table if not exists public.day_journals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists day_journals_user_day_idx on public.day_journals(user_id, day desc);

-- ============================================
-- 2. Trade Notes Table
-- ============================================
create table if not exists public.trade_notes (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trade_id)
);

create index if not exists trade_notes_trade_idx on public.trade_notes(trade_id);
create index if not exists trade_notes_user_idx on public.trade_notes(user_id);

-- ============================================
-- 3. Trade Media Table (for screenshots)
-- ============================================
create table if not exists public.trade_media (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  kind text not null default 'screenshot',
  created_at timestamptz not null default now()
);

create index if not exists trade_media_trade_idx on public.trade_media(trade_id);
create index if not exists trade_media_user_idx on public.trade_media(user_id);

-- ============================================
-- 4. Day News Table
-- ============================================
create table if not exists public.day_news (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  currency text,
  title text not null,
  impact text, -- high/medium/low
  time text,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists day_news_day_idx on public.day_news(day desc);
create index if not exists day_news_day_impact_idx on public.day_news(day desc, impact);

-- ============================================
-- 5. Updated At Triggers
-- ============================================
drop trigger if exists set_day_journals_updated_at on public.day_journals;
create trigger set_day_journals_updated_at
before update on public.day_journals
for each row execute function public.set_updated_at();

drop trigger if exists set_trade_notes_updated_at on public.trade_notes;
create trigger set_trade_notes_updated_at
before update on public.trade_notes
for each row execute function public.set_updated_at();

-- ============================================
-- 6. RLS Policies
-- ============================================

-- Enable RLS on all tables
alter table public.day_journals enable row level security;
alter table public.trade_notes enable row level security;
alter table public.trade_media enable row level security;
alter table public.day_news enable row level security;

-- Day Journals Policies (user owns their journals)
drop policy if exists "day_journals_select_own" on public.day_journals;
create policy "day_journals_select_own"
on public.day_journals
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "day_journals_insert_own" on public.day_journals;
create policy "day_journals_insert_own"
on public.day_journals
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "day_journals_update_own" on public.day_journals;
create policy "day_journals_update_own"
on public.day_journals
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "day_journals_delete_own" on public.day_journals;
create policy "day_journals_delete_own"
on public.day_journals
for delete to authenticated
using (user_id = auth.uid());

-- Trade Notes Policies (user owns their notes)
drop policy if exists "trade_notes_select_own" on public.trade_notes;
create policy "trade_notes_select_own"
on public.trade_notes
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "trade_notes_insert_own" on public.trade_notes;
create policy "trade_notes_insert_own"
on public.trade_notes
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "trade_notes_update_own" on public.trade_notes;
create policy "trade_notes_update_own"
on public.trade_notes
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "trade_notes_delete_own" on public.trade_notes;
create policy "trade_notes_delete_own"
on public.trade_notes
for delete to authenticated
using (user_id = auth.uid());

-- Trade Media Policies (user owns their media)
drop policy if exists "trade_media_select_own" on public.trade_media;
create policy "trade_media_select_own"
on public.trade_media
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "trade_media_insert_own" on public.trade_media;
create policy "trade_media_insert_own"
on public.trade_media
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "trade_media_update_own" on public.trade_media;
create policy "trade_media_update_own"
on public.trade_media
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "trade_media_delete_own" on public.trade_media;
create policy "trade_media_delete_own"
on public.trade_media
for delete to authenticated
using (user_id = auth.uid());

-- Day News Policies (all authenticated users can read)
drop policy if exists "day_news_select_all" on public.day_news;
create policy "day_news_select_all"
on public.day_news
for select to authenticated
using (true);

-- Only admins can insert/update/delete news (can be added later if needed)

-- ============================================
-- 7. Storage Bucket for Screenshots
-- ============================================
-- Note: Run this via Supabase Dashboard or SQL Editor with service_role privileges
-- insert into storage.buckets (id, name, public)
-- values ('trade-screenshots', 'trade-screenshots', false)
-- on conflict (id) do nothing;

-- Storage policies for trade-screenshots bucket
-- drop policy if exists "Users can upload own screenshots" on storage.objects;
-- create policy "Users can upload own screenshots"
-- on storage.objects for insert
-- to authenticated
-- with check (
--   bucket_id = 'trade-screenshots' and
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- drop policy if exists "Users can view own screenshots" on storage.objects;
-- create policy "Users can view own screenshots"
-- on storage.objects for select
-- to authenticated
-- using (
--   bucket_id = 'trade-screenshots' and
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- drop policy if exists "Users can delete own screenshots" on storage.objects;
-- create policy "Users can delete own screenshots"
-- on storage.objects for delete
-- to authenticated
-- using (
--   bucket_id = 'trade-screenshots' and
--   (storage.foldername(name))[1] = auth.uid()::text
-- );
