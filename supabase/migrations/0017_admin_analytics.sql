-- 0017: owner analytics for the admin app.
--
-- The admin surface is the app owner's read-only view: usage metrics, per-user
-- metrics, and every report newest-first. These views aggregate server-side so
-- the app never has to pull whole tables to count them.
--
-- All of them are security_invoker, so the existing is_admin() RLS is what
-- grants access — a facilitator reading them sees only their own rows rather
-- than an error.

-- Every activity signal we have, flattened to (user_id, at).
-- A user is "active" on a day they logged an event, recorded an answer,
-- approved a transcript, or performed an audited action.
create or replace view admin_user_activity
with (security_invoker = true) as
  select e.owner_id as user_id, e.created_at as at
    from events e
   where e.deleted_at is null
  union all
  select e.owner_id, a.recorded_at
    from answers a
    join interviewees i on i.id = a.interviewee_id
    join events e on e.id = i.event_id
   where a.recorded_at is not null
     and a.deleted_at is null
  union all
  select t.approved_by, t.approved_at
    from transcripts t
   where t.approved_by is not null
     and t.approved_at is not null
  union all
  select l.actor_id, l.at
    from audit_log l
   where l.actor_id is not null;

-- One row per account, with the counts the Users tab shows.
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
    count(*)                                          as events_total,
    count(*) filter (where e.status = 'finalised')    as reports_total
  from events e
  where e.owner_id = p.id
    and e.deleted_at is null
) ev on true
left join lateral (
  select count(*) as interviews_total
  from interviewees i
  join events e on e.id = i.event_id
  where e.owner_id = p.id
    and i.deleted_at is null
    and e.deleted_at is null
) iv on true
left join lateral (
  select count(*) as answers_recorded
  from answers a
  join interviewees i on i.id = a.interviewee_id
  join events e on e.id = i.event_id
  where e.owner_id = p.id
    and a.recorded_at is not null
    and a.deleted_at is null
) an on true
left join lateral (
  select max(ua.at) as last_active_at
  from admin_user_activity ua
  where ua.user_id = p.id
) act on true;

-- 90-day daily series behind the Overview trend block.
create or replace view admin_usage_daily
with (security_invoker = true) as
with days as (
  select generate_series(
    (current_date - interval '89 days')::date,
    current_date,
    interval '1 day'
  )::date as day
)
select
  d.day,
  (
    select count(distinct ua.user_id)
    from admin_user_activity ua
    where ua.at >= d.day and ua.at < d.day + 1
  ) as active_users,
  (
    select count(*)
    from events e
    where e.deleted_at is null
      and e.created_at >= d.day and e.created_at < d.day + 1
  ) as events_created,
  (
    select count(*)
    from event_reports r
    where r.generated_at >= d.day and r.generated_at < d.day + 1
  ) as reports_finalised
from days d;

-- The Reports tab list: every event, newest report first.
create or replace view admin_report_list
with (security_invoker = true) as
select
  e.id,
  e.title,
  e.site,
  e.status,
  e.occurred_at,
  e.created_at,
  e.owner_id,
  coalesce(nullif(p.full_name, ''), p.email)    as owner_name,
  r.generated_at                                as report_generated_at,
  r.executive_summary,
  coalesce(ins.insight_count, 0)                as insight_count,
  coalesce(iv.interviewee_count, 0)             as interviewee_count,
  coalesce(tr.transcript_count, 0)              as transcript_count,
  coalesce(r.generated_at, e.created_at)        as sort_at
from events e
left join profiles p on p.id = e.owner_id
left join event_reports r on r.event_id = e.id
left join lateral (
  select count(*) as insight_count
  from insights i
  where i.event_id = e.id and i.deleted_at is null
) ins on true
left join lateral (
  select count(*) as interviewee_count
  from interviewees i2
  where i2.event_id = e.id and i2.deleted_at is null
) iv on true
left join lateral (
  select count(*) as transcript_count
  from transcripts t
  join answers a on a.id = t.answer_id
  join interviewees i3 on i3.id = a.interviewee_id
  where i3.event_id = e.id
) tr on true
where e.deleted_at is null;

-- Headline numbers for the Overview tab, in one round trip.
create or replace function admin_usage_summary() returns json
language sql stable as $$
  with t as (
    select
      (select count(*) from profiles) as total_users,
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
