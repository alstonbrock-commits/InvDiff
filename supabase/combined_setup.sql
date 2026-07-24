-- =============================================================================
-- Interview Insights — core schema
-- Single organization. Roles: admin, facilitator. One facilitator per event.
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role       as enum ('admin', 'facilitator');
create type event_status    as enum ('draft', 'active', 'finalised');
create type upload_status   as enum ('pending', 'uploading', 'uploaded', 'failed');
create type transcript_status as enum ('pending', 'processing', 'done', 'approved', 'rejected', 'error');
create type insight_status  as enum ('draft', 'edited', 'final');
create type rec_status       as enum ('draft', 'edited', 'final');
create type job_type         as enum ('transcribe', 'insights', 'recommendations');
create type job_status       as enum ('queued', 'processing', 'done', 'error');
create type purge_source     as enum ('auto', 'manual');

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        user_role not null default 'facilitator',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- app_settings (single row)
-- ---------------------------------------------------------------------------
create table app_settings (
  id                     boolean primary key default true check (id),  -- singleton
  audio_retention_days   int not null default 90,
  consent_text_version   text not null default 'v1',
  consent_text           text not null default 'PLACEHOLDER CONSENT TEXT — replace before production. Must include a cross-border disclosure: audio recordings and transcripts are processed by AI providers located outside Australia (United States).',
  auto_approve_threshold int not null default 85,   -- transcripts scoring >= this with 0 flags are bulk-approvable
  updated_at             timestamptz not null default now()
);
insert into app_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- events (owned by one facilitator)
-- ---------------------------------------------------------------------------
create table events (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  description text,
  owner_id    uuid not null references profiles (id),
  status      event_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index on events (owner_id);

-- ---------------------------------------------------------------------------
-- event_questions (7 per event, editable)
-- ---------------------------------------------------------------------------
create table event_questions (
  id         uuid primary key default uuid_generate_v4(),
  event_id   uuid not null references events (id) on delete cascade,
  position   int not null check (position between 1 and 7),
  text       text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (event_id, position)
);
create index on event_questions (event_id);

-- ---------------------------------------------------------------------------
-- interviewees
-- ---------------------------------------------------------------------------
create table interviewees (
  id              uuid primary key default uuid_generate_v4(),
  event_id        uuid not null references events (id) on delete cascade,
  name            text not null,
  role_or_segment text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on interviewees (event_id);

-- ---------------------------------------------------------------------------
-- consents (signature gate, one per interviewee)
-- ---------------------------------------------------------------------------
create table consents (
  id                   uuid primary key default uuid_generate_v4(),
  interviewee_id       uuid not null unique references interviewees (id) on delete cascade,
  signature_path       text,            -- Storage object path (private bucket)
  consent_text_version text not null,
  signed_by_name       text not null,
  signed_at            timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- answers (one per interviewee × question — the grid cell)
-- ---------------------------------------------------------------------------
create table answers (
  id                uuid primary key default uuid_generate_v4(),
  interviewee_id    uuid not null references interviewees (id) on delete cascade,
  event_question_id uuid not null references event_questions (id) on delete cascade,
  audio_path        text,               -- Storage object path (private bucket)
  duration_ms       int,
  upload_status     upload_status not null default 'pending',
  recorded_at       timestamptz,
  audio_purged_at   timestamptz,
  purge_source      purge_source,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (interviewee_id, event_question_id)
);
create index on answers (interviewee_id);

-- ---------------------------------------------------------------------------
-- transcripts (one per answer)
-- ---------------------------------------------------------------------------
create table transcripts (
  id                    uuid primary key default uuid_generate_v4(),
  answer_id             uuid not null unique references answers (id) on delete cascade,
  text                  text,           -- raw Whisper output
  edited_text           text,           -- human-corrected (facilitator or admin)
  status                transcript_status not null default 'pending',
  quality_score         int,            -- 0..100 derived (AUDIO QUALITY, not accuracy)
  flagged_segment_count int not null default 0,
  segments              jsonb,          -- [{start,end,text,score,no_speech_prob,flagged}]
  provider              text,
  model                 text,
  rejection_note        text,
  approved_by           uuid references profiles (id),
  approved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ai_jobs (async processing + status)
-- ---------------------------------------------------------------------------
create table ai_jobs (
  id         uuid primary key default uuid_generate_v4(),
  event_id   uuid references events (id) on delete cascade,
  answer_id  uuid references answers (id) on delete cascade,
  type       job_type not null,
  status     job_status not null default 'queued',
  error      text,
  payload    jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ai_jobs (event_id);
create index on ai_jobs (status);

-- ---------------------------------------------------------------------------
-- insights (<= 5 per event)
-- ---------------------------------------------------------------------------
create table insights (
  id                 uuid primary key default uuid_generate_v4(),
  event_id           uuid not null references events (id) on delete cascade,
  position           int not null check (position between 1 and 5),
  title              text not null,
  body               text not null,
  status             insight_status not null default 'draft',
  generated_by_model text,
  generated_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (event_id, position)
);
create index on insights (event_id);

-- ---------------------------------------------------------------------------
-- recommendations (linked to insights)
-- ---------------------------------------------------------------------------
create table recommendations (
  id         uuid primary key default uuid_generate_v4(),
  insight_id uuid not null references insights (id) on delete cascade,
  body       text not null,
  status     rec_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on recommendations (insight_id);

-- ---------------------------------------------------------------------------
-- insight_evidence (the evidence link: insight -> transcript excerpt)
-- ---------------------------------------------------------------------------
create table insight_evidence (
  id            uuid primary key default uuid_generate_v4(),
  insight_id    uuid not null references insights (id) on delete cascade,
  transcript_id uuid not null references transcripts (id) on delete cascade,
  quote         text not null,
  char_start    int,
  char_end      int,
  created_at    timestamptz not null default now()
);
create index on insight_evidence (insight_id);

-- ---------------------------------------------------------------------------
-- exports (generated PDFs)
-- ---------------------------------------------------------------------------
create table exports (
  id                  uuid primary key default uuid_generate_v4(),
  event_id            uuid not null references events (id) on delete cascade,
  pdf_path            text,
  include_transcripts boolean not null default false,
  generated_by        uuid references profiles (id),
  created_at          timestamptz not null default now()
);
create index on exports (event_id);

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
create table audit_log (
  id        uuid primary key default uuid_generate_v4(),
  actor_id  uuid references profiles (id),
  action    text not null,
  entity    text not null,
  entity_id uuid,
  detail    jsonb,
  at        timestamptz not null default now()
);
create index on audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','app_settings','events','event_questions','interviewees',
    'consents','answers','transcripts','ai_jobs','insights','recommendations'
  ] loop
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$s
         for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile. First user becomes admin.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select count(*) = 0 into first_user from profiles;
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when first_user then 'admin'::user_role
         else coalesce((new.raw_user_meta_data->>'role')::user_role, 'facilitator') end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
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
-- =============================================================================
-- Private storage buckets + access policies.
-- Objects are accessed only via short-lived signed URLs generated server-side
-- or by owners; no public read.
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('audio', 'audio', false),
  ('consent-signatures', 'consent-signatures', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;

-- Path convention: <event_id>/<...>. First path segment is the event id, so we
-- can authorize by event ownership. Admins can read all.

create or replace function storage_event_id(name text) returns uuid
language sql immutable as $$
  select nullif(split_part(name, '/', 1), '')::uuid;
$$;

-- audio ---------------------------------------------------------------------
create policy audio_owner_rw on storage.objects for all
  using (
    bucket_id = 'audio'
    and (is_admin() or owns_event(storage_event_id(name)))
  )
  with check (
    bucket_id = 'audio' and owns_event(storage_event_id(name))
  );

-- consent-signatures --------------------------------------------------------
create policy sig_owner_rw on storage.objects for all
  using (
    bucket_id = 'consent-signatures'
    and (is_admin() or owns_event(storage_event_id(name)))
  )
  with check (
    bucket_id = 'consent-signatures' and owns_event(storage_event_id(name))
  );

-- exports -------------------------------------------------------------------
create policy exports_owner_rw on storage.objects for all
  using (
    bucket_id = 'exports'
    and (is_admin() or owns_event(storage_event_id(name)))
  )
  with check (
    bucket_id = 'exports' and owns_event(storage_event_id(name))
  );
-- =============================================================================
-- Automatic 90-day audio purge (admin-configurable via app_settings).
-- Deletes the audio object from Storage and stamps the answer row.
-- Runs daily via pg_cron. Transcripts are retained.
-- =============================================================================

create or replace function purge_expired_audio() returns void
language plpgsql security definer set search_path = public, storage as $$
declare
  retention_days int;
  r record;
begin
  select audio_retention_days into retention_days from app_settings where id;

  for r in
    select a.id, a.audio_path
    from answers a
    join transcripts t on t.answer_id = a.id
    where a.audio_path is not null
      and a.audio_purged_at is null
      and t.status = 'approved'
      and t.approved_at < now() - make_interval(days => retention_days)
  loop
    -- remove the storage object
    delete from storage.objects
      where bucket_id = 'audio' and name = r.audio_path;
    -- stamp the answer
    update answers
      set audio_purged_at = now(),
          purge_source = 'auto',
          audio_path = null
      where id = r.id;
  end loop;
end;
$$;

-- Manual early delete of ALL audio for a finalised event (facilitator/admin).
-- Called from an Edge Function (service role) after the export-first safeguard.
create or replace function purge_event_audio(p_event_id uuid, p_actor uuid) returns int
language plpgsql security definer set search_path = public, storage as $$
declare
  n int := 0;
  r record;
begin
  for r in
    select a.id, a.audio_path
    from answers a
    join interviewees i on i.id = a.interviewee_id
    where i.event_id = p_event_id and a.audio_path is not null and a.audio_purged_at is null
  loop
    delete from storage.objects where bucket_id = 'audio' and name = r.audio_path;
    update answers
      set audio_purged_at = now(), purge_source = 'manual', audio_path = null
      where id = r.id;
    n := n + 1;
  end loop;

  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'manual_audio_purge', 'event', p_event_id, jsonb_build_object('count', n));

  return n;
end;
$$;

-- Schedule the daily auto purge at 02:15 (server time).
select cron.schedule('purge-expired-audio', '15 2 * * *', $$select purge_expired_audio();$$);
-- =============================================================================
-- Default question template (7 rows). The app copies these into a new event's
-- event_questions. PLACEHOLDER wording — replace before production. An admin can
-- also edit these rows to change the template for future events.
-- =============================================================================

create table default_questions (
  position   int primary key check (position between 1 and 7),
  text       text not null,
  updated_at timestamptz not null default now()
);

insert into default_questions (position, text) values
  (1, 'PLACEHOLDER Q1 — What first brought you to this?'),
  (2, 'PLACEHOLDER Q2 — Walk me through a recent experience.'),
  (3, 'PLACEHOLDER Q3 — What works well for you today?'),
  (4, 'PLACEHOLDER Q4 — What is the biggest frustration?'),
  (5, 'PLACEHOLDER Q5 — If you could change one thing, what would it be?'),
  (6, 'PLACEHOLDER Q6 — What would make this significantly better?'),
  (7, 'PLACEHOLDER Q7 — Is there anything else you would like to add?');

alter table default_questions enable row level security;
create policy dq_read on default_questions for select using (auth.uid() is not null);
create policy dq_admin_write on default_questions for all
  using (is_admin()) with check (is_admin());

create trigger trg_dq_updated_at before update on default_questions
  for each row execute function set_updated_at();
