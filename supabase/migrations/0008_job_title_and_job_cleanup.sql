-- =============================================================================
-- 0008 — profile job titles + orphaned AI-job cleanup.
--   * profiles.job_title backs the sign-up form and the Account page subtitle
--   * handle_new_user() copies job_title from signup metadata
--   * pre-0008 generate-insights failures left ai_jobs stuck in 'processing'
--     (the function now marks them 'error'); close out the orphans
-- =============================================================================

alter table profiles add column if not exists job_title text;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare admin_e text;
begin
  select admin_email into admin_e from app_settings where id;
  insert into profiles (id, email, full_name, job_title, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    ),
    new.raw_user_meta_data->>'job_title',
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

-- Orphaned jobs from failures that predate error-marking.
update ai_jobs
set status = 'error', error = 'orphaned (pre-0008 failure)'
where status = 'processing';
