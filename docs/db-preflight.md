# DB Preflight (remote)

Date: 2025-12-22

## Status

Preflight is blocked until the Supabase CLI is authenticated and linked to the correct remote project.

- Supabase CLI (via `npx supabase`) is available (v2.67.3).
- `SUPABASE_ACCESS_TOKEN` is **not** set in this environment.
- This repo is **not** linked (no `supabase/.temp/project-ref`).

## How to run preflight (no Docker)

1) Authenticate (interactive):

```bash
npx --yes supabase login
```

2) Link the project (replace with the real project ref):

```bash
npx --yes supabase link --project-ref <PROJECT_REF>
```

3) Dump the remote `public` schema to inspect tables + policies (will prompt for DB password unless provided):

```bash
npx --yes supabase db dump --linked --schema public --file /tmp/remote_public_schema.sql
```

4) Optional: dump storage schema too (for bucket policies):

```bash
npx --yes supabase db dump --linked --schema storage --file /tmp/remote_storage_schema.sql
```

## Preflight queries (SQL Editor)

If you prefer the Supabase Dashboard SQL Editor, run these queries and paste results below.

### 1) Columns: public.trade_screenshots

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'trade_screenshots'
order by ordinal_position;
```

### 2) Columns: public.profiles

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
order by ordinal_position;
```

### 3) Policies: public.profiles

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;
```

### 4) Policies: public.trade_screenshots

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'trade_screenshots'
order by policyname;
```

### 5) RLS enabled check (profiles / trade_screenshots / broker_accounts / broker_connections)

```sql
select n.nspname as schema,
       c.relname as table,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('profiles','trade_screenshots','broker_accounts','broker_connections')
order by c.relname;
```

## Results (to be filled)

### trade_screenshots columns

_Pending._

### profiles columns

_Pending._

### profiles policies

_Pending._

### trade_screenshots policies

_Pending._

### RLS enabled status

_Pending._
