-- 0021: one admin account, and close role self-escalation.
--
-- The admin surface is the app owner's. There is exactly one admin login:
-- mark@investigationsdifferently.com.au. app_settings.admin_email is what
-- handle_new_user() checks when an account is created, so it has to agree.

update app_settings
set admin_email = 'mark@investigationsdifferently.com.au',
    updated_at = now();

update profiles
set role = 'admin'::user_role
where lower(email) = 'mark@investigationsdifferently.com.au';

-- Anyone else who held admin drops back to facilitator.
update profiles
set role = 'facilitator'::user_role
where role = 'admin'::user_role
  and lower(email) <> 'mark@investigationsdifferently.com.au';

-- ---------------------------------------------------------------------------
-- Privilege escalation: profiles_self_update (migration 0002) is
--   for update using (id = auth.uid() or is_admin())
-- with no WITH CHECK, so Postgres reuses USING as the check and a signed-in
-- facilitator could PATCH their own row to role='admin' through the REST API
-- and walk into the admin app. Column privileges close it without disturbing
-- the policy. A column-level REVOKE cannot subtract from a table-level grant,
-- so drop the table grant and re-grant only the columns the app writes.
-- handle_new_user() is SECURITY DEFINER and the Edge Functions use the service
-- role, so neither is affected; role changes are now an operator action.
-- ---------------------------------------------------------------------------

revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

grant update (full_name, job_title, newsletter_opt_in, newsletter_opt_in_at, updated_at)
  on public.profiles to authenticated;
