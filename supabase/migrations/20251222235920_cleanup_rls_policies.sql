-- Cleanup RLS policies (idempotent):
-- A) PROFILES: remove risky public SELECT policy and ensure authenticated-only SELECT own row
-- B) BROKER_ACCOUNTS: dedupe policies so there is exactly one per command
-- C) TRADE_SCREENSHOTS: ensure authenticated select/insert/delete policies exist (do not loosen)

begin;

-- -----------------------------------------------------------------------------
-- A) PROFILES
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) then
    execute 'alter table public.profiles enable row level security';

    -- Drop risky policy that targets {public}.
    execute 'drop policy if exists "Users can read own profile" on public.profiles';

    -- Ensure a safe authenticated-only policy exists.
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname = 'profiles_select_own_authenticated'
    ) then
      execute $$
        create policy "profiles_select_own_authenticated"
        on public.profiles
        for select
        to authenticated
        using (id = auth.uid())
      $$;
    end if;
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- B) BROKER_ACCOUNTS (dedupe)
-- -----------------------------------------------------------------------------

do $$
declare
  owner_col text;
  tbl_exists boolean;
  has_user_id boolean;
  has_owner_id boolean;
  has_profile_id boolean;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'broker_accounts'
  ) into tbl_exists;

  if not tbl_exists then
    -- Some deployments may use broker_connections instead; do not error here.
    raise notice 'broker_accounts table not found; skipping broker_accounts policy cleanup.';
    return;
  end if;

  execute 'alter table public.broker_accounts enable row level security';

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'broker_accounts' and column_name = 'user_id'
  ) into has_user_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'broker_accounts' and column_name = 'owner_id'
  ) into has_owner_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'broker_accounts' and column_name = 'profile_id'
  ) into has_profile_id;

  owner_col := case
    when has_user_id then 'user_id'
    when has_owner_id then 'owner_id'
    when has_profile_id then 'profile_id'
    else null
  end;

  if owner_col is null then
    raise notice 'broker_accounts has no user_id/owner_id/profile_id column; skipping policy creation.';
    return;
  end if;

  -- Drop both naming variants to remove duplicates.
  execute 'drop policy if exists "broker_accounts_select_own" on public.broker_accounts';
  execute 'drop policy if exists "broker_accounts_insert_own" on public.broker_accounts';
  execute 'drop policy if exists "broker_accounts_update_own" on public.broker_accounts';
  execute 'drop policy if exists "broker_accounts_delete_own" on public.broker_accounts';

  execute 'drop policy if exists "broker_accounts_select_owner" on public.broker_accounts';
  execute 'drop policy if exists "broker_accounts_insert_owner" on public.broker_accounts';
  execute 'drop policy if exists "broker_accounts_update_owner" on public.broker_accounts';
  execute 'drop policy if exists "broker_accounts_delete_owner" on public.broker_accounts';

  -- Recreate ONE consistent set: *_own.
  execute format(
    'create policy "broker_accounts_select_own" on public.broker_accounts for select to authenticated using (%I = auth.uid())',
    owner_col
  );

  execute format(
    'create policy "broker_accounts_insert_own" on public.broker_accounts for insert to authenticated with check (%I = auth.uid())',
    owner_col
  );

  execute format(
    'create policy "broker_accounts_update_own" on public.broker_accounts for update to authenticated using (%I = auth.uid()) with check (%I = auth.uid())',
    owner_col,
    owner_col
  );

  execute format(
    'create policy "broker_accounts_delete_own" on public.broker_accounts for delete to authenticated using (%I = auth.uid())',
    owner_col
  );
end$$;

-- -----------------------------------------------------------------------------
-- C) TRADE_SCREENSHOTS
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'trade_screenshots'
  ) then
    execute 'alter table public.trade_screenshots enable row level security';

    -- Ensure select/insert/delete policies exist (do not loosen):
    -- tie access to ownership of the referenced trade via trades.user_id.

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'trade_screenshots' and policyname = 'trade_screenshots_select_own'
    ) then
      execute $$
        create policy "trade_screenshots_select_own"
        on public.trade_screenshots
        for select
        to authenticated
        using (
          exists (
            select 1
            from public.trades t
            where t.id = trade_screenshots.trade_id
              and t.user_id = auth.uid()
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'trade_screenshots' and policyname = 'trade_screenshots_insert_own'
    ) then
      execute $$
        create policy "trade_screenshots_insert_own"
        on public.trade_screenshots
        for insert
        to authenticated
        with check (
          exists (
            select 1
            from public.trades t
            where t.id = trade_screenshots.trade_id
              and t.user_id = auth.uid()
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'trade_screenshots' and policyname = 'trade_screenshots_delete_own'
    ) then
      execute $$
        create policy "trade_screenshots_delete_own"
        on public.trade_screenshots
        for delete
        to authenticated
        using (
          exists (
            select 1
            from public.trades t
            where t.id = trade_screenshots.trade_id
              and t.user_id = auth.uid()
          )
        )
      $$;
    end if;
  end if;
end$$;

commit;
