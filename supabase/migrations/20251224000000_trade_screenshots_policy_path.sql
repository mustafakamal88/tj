-- Update trade-screenshots storage policies to allow paths:
--   <userId>/<tradeId>/<file>
-- (no hard-coded /trades/ segment)

begin;

-- Storage policies live on storage.objects.
-- Requires privileged execution (typical for migrations in Supabase).

drop policy if exists "trade_screenshots_objects_select_own" on storage.objects;
create policy "trade_screenshots_objects_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trade-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "trade_screenshots_objects_insert_own" on storage.objects;
create policy "trade_screenshots_objects_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trade-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "trade_screenshots_objects_delete_own" on storage.objects;
create policy "trade_screenshots_objects_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'trade-screenshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);

commit;
