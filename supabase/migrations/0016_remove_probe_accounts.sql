-- 0016: remove the throwaway accounts created while verifying signup and the
-- newsletter opt-in trigger.

delete from auth.users
where email in ('newsletter-probe@example.com', 'newsletter-probe2@example.com');
