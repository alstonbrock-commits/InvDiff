-- 0023: clean account list for the client handover, and stop removed
-- interviewees counting anywhere.
--
-- Accounts kept:
--   mark@investigationsdifferently.com.au  — the admin (the client)
--   messagebrock@gmail.com                 — facilitator who owns the demo events
-- Everything else was a development account. Deleting the auth user cascades
-- to profiles. "Pallet fell off a truck" belonged to mark13alston and goes with
-- it, leaving the eight demo events under one facilitator.

delete from events
where owner_id in (
  select id from profiles
  where lower(email) in (
    'mark13alston@gmail.com',
    'alstonfamily@gmail.com',
    'alstonbrock@gmail.com',
    'alstonbrock+facilitator@gmail.com'
  )
);

-- These accounts left traces on rows that survive them: audit entries, and
-- approvals/exports on other people's events. Those columns are nullable and
-- the history is worth keeping, so detach rather than delete.
update audit_log set actor_id = null
where actor_id in (
  select id from profiles
  where lower(email) in (
    'mark13alston@gmail.com',
    'alstonfamily@gmail.com',
    'alstonbrock@gmail.com',
    'alstonbrock+facilitator@gmail.com'
  )
);

update transcripts set approved_by = null
where approved_by in (
  select id from profiles
  where lower(email) in (
    'mark13alston@gmail.com',
    'alstonfamily@gmail.com',
    'alstonbrock@gmail.com',
    'alstonbrock+facilitator@gmail.com'
  )
);

update exports set generated_by = null
where generated_by in (
  select id from profiles
  where lower(email) in (
    'mark13alston@gmail.com',
    'alstonfamily@gmail.com',
    'alstonbrock@gmail.com',
    'alstonbrock+facilitator@gmail.com'
  )
);

delete from auth.users
where lower(email) in (
  'mark13alston@gmail.com',
  'alstonfamily@gmail.com',
  'alstonbrock@gmail.com',
  'alstonbrock+facilitator@gmail.com'
);

-- ---------------------------------------------------------------------------
-- Someone taken off a roster is soft-deleted along with their answers. The
-- report list still counted their transcripts, so an event could show
-- transcripts belonging to a person no longer on it.
-- ---------------------------------------------------------------------------

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
    and a.deleted_at is null
    and i3.deleted_at is null
) tr on true
where e.deleted_at is null;

-- Same correction for per-user metrics: answers_recorded should not include
-- answers belonging to someone removed from a roster.
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
) act on true;
