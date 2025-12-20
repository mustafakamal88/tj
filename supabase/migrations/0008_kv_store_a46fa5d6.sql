-- KV store used by the `server` edge function (MT bridge).
-- Non-destructive.

create table if not exists public.kv_store_a46fa5d6 (
  key text primary key,
  value jsonb not null
);

