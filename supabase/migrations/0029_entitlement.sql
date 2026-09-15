-- =============================================================================
-- 0029: entitlement helpers for the solo plan.
--
-- Access = admin, OR an active subscription, OR the free first report not yet
-- used. Deliberately NO entitlement check in any RLS write policy: the
-- offline outbox pushes every row as an upsert and halts on the first
-- rejected row, so a lapsed plan would wedge the device. The gate lives in
-- the app (view-only mode) and in the two expensive Edge Functions
-- (transcribe, generate-insights).
--
-- Every read/write policy from 0002/0003/0007/0012 is untouched — accounts
-- only ever see their own work (plus the read-only admin).
-- =============================================================================

create or replace function has_active_plan_for(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    left join subscriptions s on s.user_id = p.id
    where p.id = p_user and p.is_active
      and (p.role = 'admin'
           or s.access_until > now()
           or p.free_report_used_at is null)
  );
$$;

-- Called only by Edge Functions with the service role; as a SECURITY DEFINER
-- function in public it would otherwise let any signed-in caller probe
-- another account's plan.
revoke execute on function has_active_plan_for(uuid) from public, anon, authenticated;
grant execute on function has_active_plan_for(uuid) to service_role;

create or replace function has_active_plan() returns boolean
language sql stable security definer set search_path = public as $$
  select has_active_plan_for(auth.uid());
$$;

-- One call the app makes at launch:
--   kind 'admin'      → always active
--   kind 'individual' → active while the subscription's access_until holds
--   kind 'free'       → active; the free report has not been generated yet
--   kind 'none'       → view-only (free report used, no subscription)
create or replace function my_entitlement() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p profiles%rowtype;
  s subscriptions%rowtype;
  sub_json jsonb;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then
    return jsonb_build_object('active', false, 'kind', 'none', 'free_report_used', true);
  end if;

  if p.role = 'admin' then
    return jsonb_build_object(
      'active', p.is_active, 'kind', 'admin',
      'free_report_used', false, 'access_until', null, 'individual', null);
  end if;

  select * into s from subscriptions where user_id = p.id;
  sub_json := case when s.user_id is null then null else jsonb_build_object(
    'provider', s.provider, 'status', s.status,
    'trial_end', s.trial_end, 'current_period_end', s.current_period_end) end;

  if p.is_active and coalesce(s.access_until > now(), false) then
    return jsonb_build_object(
      'active', true, 'kind', 'individual',
      'free_report_used', p.free_report_used_at is not null,
      'access_until', s.access_until, 'individual', sub_json);
  end if;

  if p.is_active and p.free_report_used_at is null then
    return jsonb_build_object(
      'active', true, 'kind', 'free',
      'free_report_used', false, 'access_until', null, 'individual', sub_json);
  end if;

  return jsonb_build_object(
    'active', false, 'kind', 'none',
    'free_report_used', p.free_report_used_at is not null,
    'access_until', s.access_until, 'individual', sub_json);
end;
$$;
