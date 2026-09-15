-- 0025: remove the throwaway account used to test privilege escalation.
--
-- The probe confirmed a self-registered user cannot become admin: role in
-- signup metadata is ignored, PATCH/INSERT of profiles.role is refused (0021's
-- column grants), app_settings.admin_email is admin-only, invite-user is
-- admin-gated, and the admin address itself is already registered.

delete from auth.users where email like 'escalation-probe-%@example.com';
