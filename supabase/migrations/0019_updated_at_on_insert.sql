-- 0019: stamp updated_at on INSERT as well as UPDATE.
--
-- The pull sync is incremental: each table has a high-water mark and the app
-- asks for `updated_at > last_pulled_at`. Until now the trigger only fired
-- BEFORE UPDATE, so an INSERT kept whatever updated_at the client sent. A
-- device with a skewed clock (wrong timezone, manual clock, flat-battery
-- reset) therefore inserts rows stamped in the past, and every other device —
-- including the same device after a reinstall — silently never pulls them.
-- The rows are on the server and visible to the admin app, but invisible in
-- the facilitator app, which reads its local mirror.
--
-- Making the server the authority for updated_at also makes last-write-wins
-- conflict resolution independent of device clocks. The push path is
-- unaffected: a pushed row simply comes back on the next pull with the
-- server's timestamp, and the outbox guard stops that clobbering a local edit
-- that has not been pushed yet.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','app_settings','events','event_questions','interviewees',
    'answers','transcripts','ai_jobs','insights','recommendations',
    'event_photos','event_reports'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on %1$s;', t);
    execute format('drop trigger if exists %1$s_updated_at on %1$s;', t);
    execute format(
      'create trigger trg_%1$s_updated_at before insert or update on %1$s
         for each row execute function set_updated_at();', t);
  end loop;
end $$;
