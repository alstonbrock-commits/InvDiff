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
