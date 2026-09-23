-- 0015: repair handle_new_user().
--
-- 0014 rewrote the trigger to carry the newsletter opt-in but dropped the
-- ::user_role casts on the role CASE. `role` is an enum, so the insert raised
-- and every signup failed with "Database error saving new user".

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
      when admin_e is not null and lower(new.email) = lower(admin_e)
        then 'admin'::user_role
      else 'facilitator'::user_role
    end,
    wants_news,
    case when wants_news then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
