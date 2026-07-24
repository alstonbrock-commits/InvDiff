-- =============================================================================
-- Row Level Security
-- Facilitators: read/write only their own events (owner_id = auth.uid()) and
-- everything under them. Admins: read all; write transcripts (approval),
-- profiles, app_settings.
-- =============================================================================

-- Helpers -------------------------------------------------------------------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function owns_event(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events where id = ev and owner_id = auth.uid()
  );
$$;

create or replace function owns_interviewee(iv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from interviewees i join events e on e.id = i.event_id
    where i.id = iv and e.owner_id = auth.uid()
  );
$$;

create or replace function owns_answer(an uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from answers a
      join interviewees i on i.id = a.interviewee_id
      join events e on e.id = i.event_id
    where a.id = an and e.owner_id = auth.uid()
  );
$$;

-- Enable RLS ----------------------------------------------------------------
alter table profiles          enable row level security;
alter table app_settings      enable row level security;
alter table events            enable row level security;
alter table event_questions   enable row level security;
alter table interviewees      enable row level security;
alter table consents          enable row level security;
alter table answers           enable row level security;
alter table transcripts       enable row level security;
alter table ai_jobs           enable row level security;
alter table insights          enable row level security;
alter table recommendations   enable row level security;
alter table insight_evidence  enable row level security;
alter table exports           enable row level security;
alter table audit_log         enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update
  using (id = auth.uid() or is_admin());
create policy profiles_admin_all on profiles for all
  using (is_admin()) with check (is_admin());

-- app_settings --------------------------------------------------------------
create policy settings_read on app_settings for select using (auth.uid() is not null);
create policy settings_admin_write on app_settings for update
  using (is_admin()) with check (is_admin());

-- events --------------------------------------------------------------------
create policy events_read on events for select
  using (owner_id = auth.uid() or is_admin());
create policy events_owner_write on events for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- event_questions -----------------------------------------------------------
create policy eq_read on event_questions for select
  using (owns_event(event_id) or is_admin());
create policy eq_write on event_questions for all
  using (owns_event(event_id)) with check (owns_event(event_id));

-- interviewees --------------------------------------------------------------
create policy iv_read on interviewees for select
  using (owns_event(event_id) or is_admin());
create policy iv_write on interviewees for all
  using (owns_event(event_id)) with check (owns_event(event_id));

-- consents ------------------------------------------------------------------
create policy consents_read on consents for select
  using (owns_interviewee(interviewee_id) or is_admin());
create policy consents_write on consents for all
  using (owns_interviewee(interviewee_id)) with check (owns_interviewee(interviewee_id));

-- answers -------------------------------------------------------------------
create policy answers_read on answers for select
  using (owns_interviewee(interviewee_id) or is_admin());
create policy answers_write on answers for all
  using (owns_interviewee(interviewee_id)) with check (owns_interviewee(interviewee_id));

-- transcripts: facilitator (owner) OR admin may read/write.
-- Admin approval is the one legitimate cross-role write.
create policy transcripts_read on transcripts for select
  using (owns_answer(answer_id) or is_admin());
create policy transcripts_owner_write on transcripts for all
  using (owns_answer(answer_id)) with check (owns_answer(answer_id));
create policy transcripts_admin_write on transcripts for update
  using (is_admin()) with check (is_admin());

-- ai_jobs -------------------------------------------------------------------
create policy jobs_read on ai_jobs for select
  using (owns_event(event_id) or is_admin());
create policy jobs_write on ai_jobs for all
  using (owns_event(event_id)) with check (owns_event(event_id));

-- insights ------------------------------------------------------------------
create policy insights_read on insights for select
  using (owns_event(event_id) or is_admin());
create policy insights_write on insights for all
  using (owns_event(event_id)) with check (owns_event(event_id));

-- recommendations -----------------------------------------------------------
create policy recs_read on recommendations for select
  using (exists (select 1 from insights i where i.id = insight_id
                 and (owns_event(i.event_id) or is_admin())));
create policy recs_write on recommendations for all
  using (exists (select 1 from insights i where i.id = insight_id and owns_event(i.event_id)))
  with check (exists (select 1 from insights i where i.id = insight_id and owns_event(i.event_id)));

-- insight_evidence ----------------------------------------------------------
create policy ev_read on insight_evidence for select
  using (exists (select 1 from insights i where i.id = insight_id
                 and (owns_event(i.event_id) or is_admin())));
create policy ev_write on insight_evidence for all
  using (exists (select 1 from insights i where i.id = insight_id and owns_event(i.event_id)))
  with check (exists (select 1 from insights i where i.id = insight_id and owns_event(i.event_id)));

-- exports -------------------------------------------------------------------
create policy exports_read on exports for select
  using (owns_event(event_id) or is_admin());
create policy exports_write on exports for all
  using (owns_event(event_id)) with check (owns_event(event_id));

-- audit_log: insert by any authenticated user; read admin only ---------------
create policy audit_insert on audit_log for insert
  with check (auth.uid() is not null);
create policy audit_admin_read on audit_log for select using (is_admin());
