-- =============================================================================
-- 0028: organisations (enterprise seats), invites, individual subscriptions,
-- webhook idempotency.
--
-- Two account types. Individuals subscribe in-app (Apple / Google via
-- RevenueCat) and are tracked in `subscriptions`. Enterprise supervisors pay
-- per seat by Stripe on the web portal and are tracked in `organisations`;
-- their members hang off profiles.org_id / org_role. A supervisor is still a
-- facilitator app-wise — user_role is untouched.
--
-- Entitlement columns are written ONLY by Edge Functions (service role) from
-- provider webhooks. Migration 0021 replaced the table-level UPDATE grant on
-- profiles with a column list, so the new profile columns are read-only to the
-- device by default; onboarded_at is the one the app writes itself.
-- =============================================================================

create table if not exists organisations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  owner_id               uuid not null references profiles (id),
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  seat_count             int not null default 0,
  status                 text not null default 'pending'
    check (status in ('pending','trialing','active','past_due','canceled','closed')),
  current_period_end     timestamptz,
  -- Hard cut-off for member access. Set by the Stripe webhook to
  -- current_period_end + grace; null means never paid.
  access_until           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_organisations_owner on organisations (owner_id);

drop trigger if exists trg_organisations_updated_at on organisations;
create trigger trg_organisations_updated_at
  before insert or update on organisations
  for each row execute function set_updated_at();

alter table profiles add column if not exists org_id uuid references organisations (id);
alter table profiles add column if not exists org_role text
  check (org_role in ('supervisor','member'));
alter table profiles add column if not exists onboarded_at timestamptz;
create index if not exists idx_profiles_org on profiles (org_id);

-- The app marks the onboarding slideshow as seen; everything else stays
-- operator/webhook-only (see 0021 for why this is a grant, not a policy).
grant update (onboarded_at) on public.profiles to authenticated;

-- Seat invites. The emailed token is random; only its sha256 is stored.
create table if not exists org_invites (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organisations (id) on delete cascade,
  email            text not null,
  full_name        text,
  token_hash       text not null unique,
  invited_by       uuid references profiles (id),
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  accepted_user_id uuid,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists idx_org_invites_org_email on org_invites (org_id, lower(email));

-- Individual plans (one row per user). provider='manual' is an operator comp
-- for testers and early accounts.
create table if not exists subscriptions (
  user_id            uuid primary key references profiles (id),
  provider           text not null check (provider in ('apple','google','stripe','manual')),
  provider_ref       text,
  status             text not null,
  trial_end          timestamptz,
  current_period_end timestamptz,
  access_until       timestamptz,
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_subscriptions_updated_at on subscriptions;
create trigger trg_subscriptions_updated_at
  before insert or update on subscriptions
  for each row execute function set_updated_at();

-- Processed webhook ids (Stripe + RevenueCat) so replays are no-ops. A row
-- is inserted when an event is claimed and stamped when it finishes; a claim
-- older than five minutes with no processed_at is re-processed (worker died).
create table if not exists billing_events (
  provider     text not null,
  event_id     text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  payload      jsonb,
  primary key (provider, event_id)
);

alter table organisations  enable row level security;
alter table org_invites    enable row level security;
alter table subscriptions  enable row level security;
alter table billing_events enable row level security;   -- service role only
