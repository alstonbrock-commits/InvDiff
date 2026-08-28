-- 0013: purge the consent-capture feature.
--
-- The in-app signature step was removed; obtaining and evidencing consent is
-- the facilitator's responsibility outside the app. No real projects had been
-- run, so the data is dropped rather than retained.
--
-- Storage note: signature FILES are deleted through the Storage API (Postgres
-- blocks direct DML on storage.objects), see scripts/purge-consent-storage.js.
-- This migration removes the table, the access policy and the settings.

drop table if exists consents cascade;

drop policy if exists sig_owner_rw on storage.objects;

alter table app_settings drop column if exists consent_text;
alter table app_settings drop column if exists consent_text_version;
