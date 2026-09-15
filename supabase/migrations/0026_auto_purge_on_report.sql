-- =============================================================================
-- Audio becomes transient on the server: generate-insights purges an event's
-- audio automatically once its report is generated (source 'auto_report').
-- The daily purge_expired_audio cron stays as the backstop for events that
-- never produce a report; the device keeps its local copy for 7 days.
-- =============================================================================

alter type purge_source add value if not exists 'auto_report';

-- Re-create with a source parameter. The old 2-arg signature is DROPPED, not
-- overloaded — with a default on p_source, keeping both would make PostgREST
-- rpc calls with two named args ambiguous. Existing 2-arg callers resolve to
-- this function with the default.
drop function if exists purge_event_audio(uuid, uuid);

create function purge_event_audio(
  p_event_id uuid,
  p_actor uuid,
  p_source text default 'manual'
) returns int
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
      set audio_purged_at = now(), purge_source = p_source::purge_source, audio_path = null
      where id = r.id;
    n := n + 1;
  end loop;

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
