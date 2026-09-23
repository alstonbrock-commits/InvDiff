-- =============================================================================
-- 0007 — event site/time fields, event photos, insight factors, AI settings.
--   * events.site / events.occurred_at back the design's Site + Date/Time fields
--   * event_photos + private bucket back the Photos row on Log new event
--   * insights.factors backs the "Contributing factors" section of the design
--   * app_settings.max_insights is the admin "adjust the AI" knob
-- =============================================================================

alter table events add column if not exists site text;
alter table events add column if not exists occurred_at timestamptz;

alter table insights add column if not exists factors jsonb;

alter table app_settings add column if not exists max_insights int not null default 5
  check (max_insights between 1 and 5);

-- Photos attached to an event (metadata; the image lives in Storage) ----------
create table if not exists event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  storage_path text,
  position int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_event_photos_event on event_photos(event_id);

create trigger event_photos_updated_at before update on event_photos
  for each row execute function set_updated_at();

alter table event_photos enable row level security;

create policy event_photos_read on event_photos for select
  using (owns_event(event_id) or is_admin());
create policy event_photos_write on event_photos for all
  using (owns_event(event_id))
  with check (owns_event(event_id));

-- Bucket + policy, same shape as audio/consent-signatures (0003) --------------
insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', false)
on conflict (id) do nothing;

create policy photos_owner_rw on storage.objects for all
  using (
    bucket_id = 'event-photos'
    and (is_admin() or owns_event(storage_event_id(name)))
  )
  with check (
    bucket_id = 'event-photos' and owns_event(storage_event_id(name))
  );
