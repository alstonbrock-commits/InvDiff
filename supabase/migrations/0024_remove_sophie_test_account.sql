-- 0024: remove the remaining test account ahead of the client handover.
--
-- sophie.fewtrell16@gmail.com signed up on 2026-08-22 and created one event
-- ("Miss"), which finalised after only one of its two interviewees had been
-- interviewed — the gate bug fixed in the same release. Account and event go
-- together, leaving the admin plus the eight demo events.

delete from events
where owner_id in (
  select id from profiles where lower(email) = 'sophie.fewtrell16@gmail.com'
);

update audit_log set actor_id = null
where actor_id in (
  select id from profiles where lower(email) = 'sophie.fewtrell16@gmail.com'
);

update transcripts set approved_by = null
where approved_by in (
  select id from profiles where lower(email) = 'sophie.fewtrell16@gmail.com'
);

update exports set generated_by = null
where generated_by in (
  select id from profiles where lower(email) = 'sophie.fewtrell16@gmail.com'
);

delete from auth.users where lower(email) = 'sophie.fewtrell16@gmail.com';
