-- 0012: restructure AI output to the client's Event Insights report spec.
--
-- The report is now a de-identified learning document, not an evidence pack:
-- event description + executive summary + insights (theme / insight /
-- supporting examples / system significance) + up to three recommendations
-- carrying rationale and verification + limitations + next steps.

-- Report-level content (one row per event).
create table if not exists event_reports (
  event_id            uuid primary key references events (id) on delete cascade,
  event_description   text,
  executive_summary   text,
  limitations         text,
  next_steps          jsonb not null default '[]'::jsonb,
  data_quality_note   text,          -- shown in the report only when material
  internal_quality_note text,        -- audit trail, never exported
  facilitator_name    text,
  interviews_reviewed int not null default 0,
  roles_reviewed      jsonb not null default '[]'::jsonb,
  generated_by_model  text,
  generated_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table event_reports enable row level security;

-- Same visibility rule as insights: event owner, or any admin.
drop policy if exists event_reports_read on event_reports;
create policy event_reports_read on event_reports for select
  using (owns_event(event_id) or is_admin());
drop policy if exists event_reports_write on event_reports;
create policy event_reports_write on event_reports for all
  using (owns_event(event_id) or is_admin())
  with check (owns_event(event_id) or is_admin());

-- Insights gain the report's vocabulary. `factors` stays for older rows.
alter table insights add column if not exists theme text;
alter table insights add column if not exists system_significance text;
-- [{ text, include_in_report }] — the facilitator can drop an example.
alter table insights add column if not exists supporting_examples jsonb
  not null default '[]'::jsonb;

-- Recommendations gain the spec's columns. `body` remains the action itself.
alter table recommendations add column if not exists risk_reduction_rationale text;
alter table recommendations add column if not exists verification_method text;
-- Transcript supports the issue but not a specific fix → "Option to consider".
alter table recommendations add column if not exists is_option boolean not null default false;
alter table recommendations add column if not exists position int;

-- Housekeeping: remove the account created while probing the signup endpoint.
delete from auth.users where email = 'probe-test-1@example.com';
