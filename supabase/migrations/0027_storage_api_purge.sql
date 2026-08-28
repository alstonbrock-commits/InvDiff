-- =============================================================================
-- Supabase now rejects `delete from storage.objects` in SQL (42501: "Direct
-- deletion from storage tables is not allowed. Use the Storage API instead").
-- That broke purge_event_audio (0026) AND the nightly purge_expired_audio
-- cron from 0004 — both had been failing silently.
--
-- New split: SQL functions only STAMP answer rows; Storage objects are removed
-- through the Storage API by Edge Functions:
--   * generate-insights / purge-event-audio → _shared/purgeAudio.ts
--   * purge-expired-audio (new) — the nightly backstop, invoked by pg_cron via
--     pg_net. It needs no key: deployed with --no-verify-jwt and guarded by an
--     x-purge-source header; the worst an outsider could do is run the
--     retention policy a few hours early.
-- =============================================================================

-- 1. Stamp-only event purge (audit retained). Object removal happens before
--    this is called.
create or replace function purge_event_audio(
  p_event_id uuid,
  p_actor uuid,
  p_source text default 'manual'
) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
begin
  update answers a
     set audio_purged_at = now(),
         purge_source = p_source::purge_source,
         audio_path = null
    from interviewees i
   where i.id = a.interviewee_id
     and i.event_id = p_event_id
     and a.audio_path is not null
     and a.audio_purged_at is null;
  get diagnostics n = row_count;

  insert into audit_log (actor_id, action, entity, entity_id, detail)
  values (
    p_actor,
    case when p_source = 'manual' then 'manual_audio_purge' else 'auto_audio_purge' end,
    'event',
    p_event_id,
    jsonb_build_object('count', n, 'source', p_source)
  );
  return n;
end;
$$;

-- 2. Expired-audio candidates for the backstop (answers whose transcript was
--    approved more than audio_retention_days ago and whose audio survived —
--    i.e. events that never generated a report).
create or replace function expired_audio_answers()
returns table (id uuid, audio_path text)
language sql security definer set search_path = public as $$
  select a.id, a.audio_path
    from answers a
    join transcripts t on t.answer_id = a.id
   where a.audio_path is not null
     and a.audio_purged_at is null
     and t.status = 'approved'
     and t.approved_at < now() - make_interval(
           days => (select audio_retention_days from app_settings where id));
$$;

-- 3. Stamp a batch after the Storage API removed the objects.
create or replace function stamp_audio_purged(p_answer_ids uuid[], p_source text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
begin
  update answers
     set audio_purged_at = now(),
         purge_source = p_source::purge_source,
         audio_path = null
   where id = any(p_answer_ids)
     and audio_purged_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 4. Retire the SQL-only cron job and schedule the Edge Function instead.
drop function if exists purge_expired_audio();
select cron.unschedule(jobid) from cron.job where jobname = 'purge-expired-audio';

create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'purge-expired-audio',
  '15 2 * * *',
  $$
  select net.http_post(
    url     := 'https://sbyasmwhvqklvnvyoxko.supabase.co/functions/v1/purge-expired-audio',
    headers := '{"Content-Type":"application/json","x-purge-source":"cron"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
