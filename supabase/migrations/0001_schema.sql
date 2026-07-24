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
