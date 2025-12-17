-- Admin-only RPC to set plan by email.
-- Works in SQL editor (postgres) and in service-role requests (no auth.uid()).
-- Blocks normal users unless profiles.is_admin = true.

create or replace function public.admin_set_plan(p_email text, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_allowed boolean := false;
begin
  -- Allow SQL editor (postgres) and service role calls
  if current_user = 'postgres' or v_role = 'service_role' then
    v_allowed := true;
  else
    if auth.uid() is null then
      raise exception 'Not authenticated';
    end if;
    if exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    raise exception 'Admin only';
  end if;

  if p_plan not in ('free','pro','premium') then
    raise exception 'Invalid plan: %', p_plan;
  end if;

  select id into v_uid from public.profiles where email = p_email limit 1;
  if v_uid is null then
    raise exception 'User not found: %', p_email;
  end if;

  update public.profiles
  set
    subscription_plan = p_plan,
    subscription_status = case when p_plan = 'free' then 'trialing' else 'active' end,
    current_period_end = case when p_plan = 'free' then null else now() + interval '30 days' end,
    updated_at = now()
  where id = v_uid;
end;
$$;

revoke all on function public.admin_set_plan(text, text) from public;
grant execute on function public.admin_set_plan(text, text) to authenticated, service_role;

