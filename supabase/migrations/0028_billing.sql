-- =============================================================================
-- 0028: solo subscriptions + the free first report.
--
-- One plan: Individual, A$19.99/month incl. GST, bought ONLY through Apple's
-- App Store or Google Play (RevenueCat fronts both). There is no Stripe and
-- no organisation/team tier. Instead of a time-based trial, every new account
-- may generate ONE insight report free; profiles.free_report_used_at is
-- stamped by generate-insights when that report persists, after which the
-- expensive paths (transcribe, generate-insights) require a subscription and
-- the app drops to view-only.
--
-- Entitlement columns are written ONLY by Edge Functions (service role) from
-- the RevenueCat webhook. Migration 0021 replaced the table-level UPDATE
-- grant on profiles with a column list, so the new profile columns are
-- read-only to the device by default; onboarded_at is the one the app writes
-- itself.
-- =============================================================================

-- One row per user; written by revenuecat-webhook (provider apple/google) or
-- by an operator ('manual' comps for testers and early accounts).
create table if not exists subscriptions (
  user_id            uuid primary key references profiles (id),
  provider           text not null check (provider in ('apple', 'google', 'manual')),
  provider_ref       text,
  status             text not null,
  trial_end          timestamptz,
  current_period_end timestamptz,
  -- Hard cut-off for access: period end + grace, set by the webhook.
  access_until       timestamptz,
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_subscriptions_updated_at on subscriptions;
create trigger trg_subscriptions_updated_at
  before insert or update on subscriptions
  for each row execute function set_updated_at();

-- Processed webhook ids so replays are no-ops. A row is inserted when an
-- event is claimed and stamped when it finishes; a claim older than five
-- minutes with no processed_at is re-processed (worker died mid-run).
create table if not exists billing_events (
  provider     text not null,
  event_id     text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  payload      jsonb,
  primary key (provider, event_id)
);

alter table profiles add column if not exists onboarded_at timestamptz;
-- Stamped by generate-insights the first time a report persists for this
-- account. NULL = the free report is still available.
alter table profiles add column if not exists free_report_used_at timestamptz;

-- The app marks the onboarding slideshow as seen; everything else stays
-- operator/webhook-only (see 0021 for why this is a grant, not a policy).
grant update (onboarded_at) on public.profiles to authenticated;

alter table subscriptions  enable row level security;
alter table billing_events enable row level security;   -- service role only

drop policy if exists subs_self_read on subscriptions;
create policy subs_self_read on subscriptions for select
  using (user_id = auth.uid() or is_admin());
