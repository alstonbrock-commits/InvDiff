-- 0020: make admin_usage_daily survive real data.
--
-- The first version ran three correlated subqueries per day across a 90-day
-- series — roughly 270 scans of the admin_user_activity union — which was
-- fine on a handful of rows and started timing out (57014) once there were
-- twenty-odd events with transcripts and an audit trail behind them. The
-- Dashboard's trend block then silently rendered nothing.
--
-- Same output, but each source is scanned once and grouped, then joined onto
-- the day series.

create or replace view admin_usage_daily
with (security_invoker = true) as
with days as (
  select generate_series(
    (current_date - interval '89 days')::date,
    current_date,
    interval '1 day'
  )::date as day
),
active as (
  select ua.at::date as day, count(distinct ua.user_id) as active_users
  from admin_user_activity ua
  where ua.at >= current_date - interval '89 days'
  group by 1
),
created as (
  select e.created_at::date as day, count(*) as events_created
  from events e
  where e.deleted_at is null
    and e.created_at >= current_date - interval '89 days'
  group by 1
),
reported as (
  select r.generated_at::date as day, count(*) as reports_finalised
  from event_reports r
  where r.generated_at >= current_date - interval '89 days'
  group by 1
)
select
  d.day,
  coalesce(active.active_users, 0)      as active_users,
  coalesce(created.events_created, 0)   as events_created,
  coalesce(reported.reports_finalised, 0) as reports_finalised
from days d
left join active   on active.day = d.day
left join created  on created.day = d.day
left join reported on reported.day = d.day;

-- Supporting indexes for the activity sources (all are date-range scans).
create index if not exists idx_events_created_at on events (created_at);
create index if not exists idx_answers_recorded_at on answers (recorded_at)
  where recorded_at is not null;
create index if not exists idx_transcripts_approved_at on transcripts (approved_at)
  where approved_at is not null;
create index if not exists idx_audit_log_at on audit_log (at);
create index if not exists idx_event_reports_generated_at on event_reports (generated_at);
