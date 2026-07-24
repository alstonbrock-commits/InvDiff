-- =============================================================================
-- Default question template (7 rows). The app copies these into a new event's
-- event_questions. PLACEHOLDER wording — replace before production. An admin can
-- also edit these rows to change the template for future events.
-- =============================================================================

create table default_questions (
  position   int primary key check (position between 1 and 7),
  text       text not null,
  updated_at timestamptz not null default now()
);

insert into default_questions (position, text) values
  (1, 'PLACEHOLDER Q1 — What first brought you to this?'),
  (2, 'PLACEHOLDER Q2 — Walk me through a recent experience.'),
  (3, 'PLACEHOLDER Q3 — What works well for you today?'),
  (4, 'PLACEHOLDER Q4 — What is the biggest frustration?'),
  (5, 'PLACEHOLDER Q5 — If you could change one thing, what would it be?'),
  (6, 'PLACEHOLDER Q6 — What would make this significantly better?'),
  (7, 'PLACEHOLDER Q7 — Is there anything else you would like to add?');

alter table default_questions enable row level security;
create policy dq_read on default_questions for select using (auth.uid() is not null);
create policy dq_admin_write on default_questions for all
  using (is_admin()) with check (is_admin());

create trigger trg_dq_updated_at before update on default_questions
  for each row execute function set_updated_at();
