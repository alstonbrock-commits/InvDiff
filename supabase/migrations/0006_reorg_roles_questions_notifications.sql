-- =============================================================================
-- 0006 — Reorg: open facilitator sign-up, single admin (by email), fixed
-- questions (admin-editable), and admin notifications when an event is logged.
-- =============================================================================

-- 1. Admin identity + config ------------------------------------------------
alter table app_settings add column if not exists admin_email text;
alter table app_settings add column if not exists email_notifications boolean not null default true;

-- 2. New-user trigger: everyone is a facilitator EXCEPT the configured admin
--    email. (Replaces the old "first user = admin" rule now that sign-up is open
--    and facilitators self-register via Google/Apple.)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare admin_e text;
begin
  select admin_email into admin_e from app_settings where id;
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    ),
    case
      when admin_e is not null and lower(new.email) = lower(admin_e)
        then 'admin'::user_role
      else 'facilitator'::user_role
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. Real fixed question set (admin-editable template; fixed for facilitators)
update default_questions set text = case position
  when 1 then 'Walk me through what happened. Describe the event.'
  when 2 then 'What surprised you about the event?'
  when 3 then 'Could things have gone worse? And why didn''t they?'
  when 4 then 'When this task works well, what must go right?'
  when 5 then 'What frustrates you when you do this task?'
  when 6 then 'What could management better understand about this task?'
  when 7 then 'How could we improve how we do this task?'
end
where position between 1 and 7;

-- 4. Admin notifications — the in-app feed of logged (finalised) events.
create table if not exists admin_notifications (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid references events (id) on delete cascade,
  facilitator_id uuid references profiles (id),
  message        text not null,
  seen_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_adminnotif_created on admin_notifications (created_at desc);

alter table admin_notifications enable row level security;
drop policy if exists adminnotif_admin on admin_notifications;
create policy adminnotif_admin on admin_notifications for all
  using (is_admin()) with check (is_admin());

-- 5. Trigger: when an event transitions to 'finalised', record an admin
--    notification (in-app feed). Email is sent separately by the app calling the
--    notify-admin Edge Function at finalise time.
create or replace function on_event_finalised() returns trigger
language plpgsql security definer set search_path = public as $$
declare fac text;
begin
  if new.status = 'finalised' and (old.status is distinct from 'finalised') then
    select coalesce(nullif(full_name, ''), email) into fac
      from profiles where id = new.owner_id;
    insert into admin_notifications (event_id, facilitator_id, message)
    values (
      new.id,
      new.owner_id,
      coalesce(fac, 'A facilitator') || ' logged the event "' || new.title || '"'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_finalised on events;
create trigger trg_event_finalised
  after update on events
  for each row execute function on_event_finalised();
