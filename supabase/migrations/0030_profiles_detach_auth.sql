-- =============================================================================
-- 0030: let a profile outlive its auth user (account deletion).
--
-- profiles.id cascaded from auth.users, while events.owner_id (and
-- transcripts.approved_by, exports.generated_by, audit_log.actor_id,
-- admin_notifications.facilitator_id) reference profiles with the default
-- RESTRICT. Deleting the auth user of anyone who owned an event therefore
-- failed outright. delete-account removes the user's events first, but rows
-- like audit_log entries legitimately outlive the account, so the profile
-- row stays (scrubbed of personal details) while the auth user goes.
--
-- Because the FK was also the only thing that kept profiles in step with
-- auth.users on EVERY deletion path (dashboard "Delete user", operator SQL,
-- future functions), a trigger now scrubs the profile whenever the auth row
-- is removed — delete-account is no longer the only careful path.
-- =============================================================================

alter table profiles drop constraint if exists profiles_id_fkey;

alter table profiles add column if not exists deleted_at timestamptz;

-- Scrub on auth deletion: no PII left, nothing to sign in with.
create or replace function handle_deleted_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set
    email = 'deleted-' || old.id || '@deleted.invalid',
    full_name = 'Deleted user',
    job_title = null,
    newsletter_opt_in = false,
    newsletter_opt_in_at = null,
    is_active = false,
    onboarded_at = null,
    deleted_at = coalesce(deleted_at, now())
  where id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function handle_deleted_user();

-- Admin analytics must not count scrubbed accounts (the cascade used to
-- remove them; now they linger by design).
create or replace view admin_user_metrics
with (security_invoker = true) as
select
  p.id,
  p.email,
  p.full_name,
  p.job_title,
  p.role,
  p.created_at,
  p.newsletter_opt_in,
  coalesce(ev.events_total, 0)     as events_total,
  coalesce(ev.reports_total, 0)    as reports_total,
  coalesce(iv.interviews_total, 0) as interviews_total,
  coalesce(an.answers_recorded, 0) as answers_recorded,
  act.last_active_at
from profiles p
left join lateral (
  select
    count(*)                                       as events_total,
    count(*) filter (where e.status = 'finalised') as reports_total
  from events e
  where e.owner_id = p.id and e.deleted_at is null
) ev on true
left join lateral (
  select count(*) as interviews_total
  from interviewees i
  join events e on e.id = i.event_id
  where e.owner_id = p.id and i.deleted_at is null and e.deleted_at is null
) iv on true
left join lateral (
  select count(*) as answers_recorded
  from answers a
  join interviewees i on i.id = a.interviewee_id
  join events e on e.id = i.event_id
  where e.owner_id = p.id
    and a.recorded_at is not null
    and a.deleted_at is null
    and i.deleted_at is null
) an on true
left join lateral (
  select max(ua.at) as last_active_at
  from admin_user_activity ua
  where ua.user_id = p.id
) act on true
where p.deleted_at is null;

create or replace function admin_usage_summary() returns json
language sql stable as $$
  with t as (
    select
      (select count(*) from profiles where deleted_at is null) as total_users,
      (select count(*) from events where deleted_at is null) as total_events,
      (
        select count(*) from events
        where deleted_at is null and status = 'finalised'
      ) as total_reports,
      (
        select count(*)
        from interviewees i
        join events e on e.id = i.event_id
        where i.deleted_at is null and e.deleted_at is null
      ) as total_interviews,
      (
        select count(distinct user_id) from admin_user_activity
        where at >= now() - interval '1 day'
      ) as active_1d,
      (
        select count(distinct user_id) from admin_user_activity
        where at >= now() - interval '7 days'
      ) as active_7d,
      (
        select count(distinct user_id) from admin_user_activity
        where at >= now() - interval '30 days'
      ) as active_30d,
      (
        select count(*) from events
        where deleted_at is null and created_at >= now() - interval '30 days'
      ) as events_30d,
      (
        select count(*) from event_reports
        where generated_at >= now() - interval '30 days'
      ) as reports_30d
  )
  select json_build_object(
    'total_users',      t.total_users,
    'total_events',     t.total_events,
    'total_reports',    t.total_reports,
    'total_interviews', t.total_interviews,
    'active_1d',        t.active_1d,
    'active_7d',        t.active_7d,
    'active_30d',       t.active_30d,
    'events_30d',       t.events_30d,
    'reports_30d',      t.reports_30d,
    'events_per_active_user_30d',
      round(t.events_30d::numeric / nullif(t.active_30d, 0), 1),
    'events_per_user',
      round(t.total_events::numeric / nullif(t.total_users, 0), 1),
    'reports_per_user',
      round(t.total_reports::numeric / nullif(t.total_users, 0), 1)
  )
  from t;
$$;
