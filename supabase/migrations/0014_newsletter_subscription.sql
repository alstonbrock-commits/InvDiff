-- 0014: newsletter subscription captured at sign-up.
--
-- The checkbox is ticked by default, so this is an OPT-OUT. We store the
-- timestamp of the choice as the record of when (and therefore under which
-- wording) the person subscribed, and every change updates it — that record is
-- what makes an unsubscribe request auditable.

alter table profiles
  add column if not exists newsletter_opt_in boolean not null default false;
alter table profiles
  add column if not exists newsletter_opt_in_at timestamptz;

-- Carry the sign-up choice from auth metadata onto the profile row.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  admin_e text;
  wants_news boolean;
begin
  select admin_email into admin_e from app_settings where id;
  wants_news := coalesce(
    (new.raw_user_meta_data ->> 'newsletter_opt_in')::boolean, false
  );

  insert into profiles (
    id, email, full_name, job_title, role, newsletter_opt_in, newsletter_opt_in_at
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    new.raw_user_meta_data ->> 'job_title',
    case
      when admin_e is not null and lower(new.email) = lower(admin_e) then 'admin'
      else 'facilitator'
    end,
    wants_news,
    case when wants_news then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Mailing list for the admin to export. Admin-only via the view's barrier +
-- the underlying profiles RLS.
create or replace view newsletter_subscribers
with (security_invoker = true) as
select
  id,
  email,
  full_name,
  job_title,
  newsletter_opt_in_at as subscribed_at
from profiles
where newsletter_opt_in
order by newsletter_opt_in_at desc nulls last;
