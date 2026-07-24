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
