-- =============================================================================
-- 0029: organisation-aware row visibility + entitlement helpers.
--
-- Supervisors READ everything their members own (events, roster, answers,
-- transcripts, insights, reports, storage objects). Writes stay owner-only —
-- every *_write policy from 0002/0007/0012 is left untouched. Members see only
-- their own work, exactly as before.
--
-- Deliberately NOT here: an entitlement check on events INSERT. The offline
-- outbox pushes every row as an upsert and halts on the first rejected row, so
-- a lapsed plan would wedge the device. The plan gate lives in the app and in
-- the two expensive Edge Functions (transcribe, generate-insights).
-- =============================================================================

-- Helpers -------------------------------------------------------------------
create or replace function my_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid() and is_active;
$$;

create or replace function is_org_supervisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and is_active
      and org_role = 'supervisor' and org_id is not null
  );
$$;

create or replace function can_read_event(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from events e
    join profiles o on o.id = e.owner_id
    where e.id = ev
      and (e.owner_id = auth.uid()
           or (is_org_supervisor() and o.org_id = my_org_id()))
  );
$$;

create or replace function can_read_interviewee(iv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from interviewees i where i.id = iv and can_read_event(i.event_id)
  );
$$;

create or replace function can_read_answer(an uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from answers a
    join interviewees i on i.id = a.interviewee_id
    where a.id = an and can_read_event(i.event_id)
  );
$$;

-- Entitlement: admin, or an organisation / individual plan whose access_until
-- is in the future. Deactivated accounts never qualify.
create or replace function has_active_plan_for(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    left join organisations o on o.id = p.org_id
    left join subscriptions s on s.user_id = p.id
    where p.id = p_user and p.is_active
      and (p.role = 'admin'
           or o.access_until > now()
           or s.access_until > now())
  );
$$;

create or replace function has_active_plan() returns boolean
language sql stable security definer set search_path = public as $$
  select has_active_plan_for(auth.uid());
$$;

-- Read policies (drop + recreate) --------------------------------------------
-- One source of truth: the SECURITY DEFINER helper, not an RLS-dependent
-- subquery that only works while profiles_org_read happens to expose the
-- right rows.
drop policy if exists events_read on events;
create policy events_read on events for select
  using (can_read_event(id));

drop policy if exists eq_read on event_questions;
create policy eq_read on event_questions for select
  using (can_read_event(event_id));

drop policy if exists iv_read on interviewees;
create policy iv_read on interviewees for select
  using (can_read_event(event_id));

drop policy if exists answers_read on answers;
create policy answers_read on answers for select
  using (can_read_interviewee(interviewee_id));

drop policy if exists transcripts_read on transcripts;
create policy transcripts_read on transcripts for select
  using (can_read_answer(answer_id));

drop policy if exists jobs_read on ai_jobs;
create policy jobs_read on ai_jobs for select
  using (can_read_event(event_id));

drop policy if exists insights_read on insights;
create policy insights_read on insights for select
  using (can_read_event(event_id));

drop policy if exists recs_read on recommendations;
create policy recs_read on recommendations for select
  using (exists (select 1 from insights i
                 where i.id = insight_id and can_read_event(i.event_id)));

drop policy if exists ev_read on insight_evidence;
create policy ev_read on insight_evidence for select
  using (exists (select 1 from insights i
                 where i.id = insight_id and can_read_event(i.event_id)));

drop policy if exists exports_read on exports;
create policy exports_read on exports for select
  using (can_read_event(event_id));

drop policy if exists event_photos_read on event_photos;
create policy event_photos_read on event_photos for select
  using (can_read_event(event_id));

drop policy if exists event_reports_read on event_reports;
create policy event_reports_read on event_reports for select
  using (can_read_event(event_id));

-- Storage: the old FOR ALL policies granted read+write together. Split them so
-- a supervisor can download a member's audio/photo/PDF but never remove it.
drop policy if exists audio_owner_rw on storage.objects;
drop policy if exists exports_owner_rw on storage.objects;
drop policy if exists photos_owner_rw on storage.objects;

drop policy if exists audio_read on storage.objects;
create policy audio_read on storage.objects for select
  using (bucket_id = 'audio' and can_read_event(storage_event_id(name)));
drop policy if exists audio_insert on storage.objects;
create policy audio_insert on storage.objects for insert
  with check (bucket_id = 'audio' and owns_event(storage_event_id(name)));
drop policy if exists audio_update on storage.objects;
create policy audio_update on storage.objects for update
  using (bucket_id = 'audio' and owns_event(storage_event_id(name)))
  with check (bucket_id = 'audio' and owns_event(storage_event_id(name)));
drop policy if exists audio_delete on storage.objects;
create policy audio_delete on storage.objects for delete
  using (bucket_id = 'audio' and owns_event(storage_event_id(name)));

drop policy if exists exports_read on storage.objects;
create policy exports_read on storage.objects for select
  using (bucket_id = 'exports' and can_read_event(storage_event_id(name)));
drop policy if exists exports_insert on storage.objects;
create policy exports_insert on storage.objects for insert
  with check (bucket_id = 'exports' and owns_event(storage_event_id(name)));
drop policy if exists exports_update on storage.objects;
create policy exports_update on storage.objects for update
  using (bucket_id = 'exports' and owns_event(storage_event_id(name)))
  with check (bucket_id = 'exports' and owns_event(storage_event_id(name)));
drop policy if exists exports_delete on storage.objects;
create policy exports_delete on storage.objects for delete
  using (bucket_id = 'exports' and owns_event(storage_event_id(name)));

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select
  using (bucket_id = 'event-photos' and can_read_event(storage_event_id(name)));
drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert
  with check (bucket_id = 'event-photos' and owns_event(storage_event_id(name)));
drop policy if exists photos_update on storage.objects;
create policy photos_update on storage.objects for update
  using (bucket_id = 'event-photos' and owns_event(storage_event_id(name)))
  with check (bucket_id = 'event-photos' and owns_event(storage_event_id(name)));
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete
  using (bucket_id = 'event-photos' and owns_event(storage_event_id(name)));

-- Profiles: a supervisor reads every member of their organisation; a member
-- can read their supervisor (name shown when the plan lapses).
drop policy if exists profiles_org_read on profiles;
create policy profiles_org_read on profiles for select
  using (
    org_id is not null
    and org_id = my_org_id()
    and (is_org_supervisor() or org_role = 'supervisor')
  );

-- New tables: read-only to their members / owner; writes are service-role.
drop policy if exists org_member_read on organisations;
create policy org_member_read on organisations for select
  using (id = my_org_id() or owner_id = auth.uid() or is_admin());

drop policy if exists invites_supervisor_read on org_invites;
create policy invites_supervisor_read on org_invites for select
  using (org_id = my_org_id() and is_org_supervisor());

drop policy if exists subs_self_read on subscriptions;
create policy subs_self_read on subscriptions for select
  using (user_id = auth.uid() or is_admin());

-- The slice of profiles the app mirrors locally for the supervisor feed.
create or replace view team_members
with (security_invoker = true) as
select id, full_name, email, job_title, org_role, is_active, updated_at
from profiles
where org_id is not null;

-- One call the app makes at launch to decide paywall / inactive / dashboard.
create or replace function my_entitlement() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p          profiles%rowtype;
  o          organisations%rowtype;
  s          subscriptions%rowtype;
  seats_used int;
  pending    int;
  sup_name   text;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then
    return jsonb_build_object('active', false, 'kind', 'none');
  end if;

  if p.role = 'admin' then
    return jsonb_build_object(
      'active', p.is_active, 'kind', 'admin',
      'access_until', null, 'org', null, 'individual', null);
  end if;

  if p.org_id is not null then
    select * into o from organisations where id = p.org_id;
    select count(*) into seats_used from profiles
      where org_id = o.id and is_active;
    select count(*) into pending from org_invites
      where org_id = o.id and accepted_at is null
        and revoked_at is null and expires_at > now();
    select coalesce(nullif(full_name, ''), email) into sup_name
      from profiles where id = o.owner_id;
    return jsonb_build_object(
      'active', p.is_active and coalesce(o.access_until > now(), false),
      'kind', 'org',
      'access_until', o.access_until,
      'org', jsonb_build_object(
        'id', o.id, 'name', o.name, 'role', p.org_role, 'status', o.status,
        'seat_count', o.seat_count, 'seats_used', seats_used,
        'pending_invites', pending, 'current_period_end', o.current_period_end,
        'supervisor_name', sup_name),
      'individual', null);
  end if;

  select * into s from subscriptions where user_id = p.id;
  return jsonb_build_object(
    'active', p.is_active and coalesce(s.access_until > now(), false),
    'kind', case when s.user_id is null then 'none' else 'individual' end,
    'access_until', s.access_until,
    'org', null,
    'individual', case when s.user_id is null then null else jsonb_build_object(
      'provider', s.provider, 'status', s.status,
      'trial_end', s.trial_end, 'current_period_end', s.current_period_end) end);
end;
$$;
