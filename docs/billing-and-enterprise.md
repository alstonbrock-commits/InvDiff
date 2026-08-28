# Billing, plans and enterprise teams

_Added 28 Aug 2026. Companion to `architecture.md`. The product decisions behind this are in the approved production plan; this doc is the operational reference._

## The two plans

| | Individual | Enterprise |
|---|---|---|
| Who | one investigator | a supervisor + team members |
| Price | **A$29.99 / month incl. GST**, 7-day free trial | **A$19.99 / user / month incl. GST**, min 3 seats, supervisor counts as a seat, no trial |
| Bought where | **in the app** via Apple IAP / Google Play Billing (RevenueCat), or on the web portal by card (Stripe) | **web portal only** (Stripe Checkout, per-seat quantity) |
| Tax invoice | Stripe: automatic per payment. **App Store / Google Play: Apple/Google are merchant of record and issue the receipt/tax invoice — we cannot.** | Stripe: automatic per payment, customer's ABN printed when supplied |
| Data model | `subscriptions` row keyed by user | `organisations` row + `profiles.org_id` / `org_role` |

**Store policy (do not regress):** nothing in the mobile app may point to a non-IAP way of buying — no "set up enterprise at …", no billing-portal link, no enterprise pricing. The paywall only says "Part of a team? Ask your supervisor for an invite."

## How access is decided

`my_entitlement()` (migration 0029) is the one call the app makes: admin → always; enterprise → `organisations.access_until > now()`; individual → `subscriptions.access_until > now()`. `access_until` is written only by the webhooks (period end + grace). The app caches the last answer (`entitlement-cache:<uid>`) so a field device without reception still opens.

Gate order (`src/lib/gate.ts`): login → admin console → `/complete-profile` (OAuth sign-ups with no job title) → `/paywall` (individual, no plan) or `/subscription-inactive` (enterprise lapsed / member removed) → `/onboarding` (once, `profiles.onboarded_at`) → app.

Server-side the plan is enforced only where money is spent: `transcribe` and `generate-insights` call `has_active_plan_for(owner)` and return **402 `subscription_required`**. Deliberately **no** RLS check on `events` INSERT — the offline outbox halts on the first rejected row.

## Supervisors

- `is_org_supervisor()` + `can_read_event()` (0029) let a supervisor **read** every member's events, roster, answers, transcripts, insights, reports and storage objects. Write policies are unchanged (owner-only), and the app hides every write affordance on a team member's event (roster, approve, record screens).
- The app mirrors the `team_members` view into SQLite (`MIGRATIONS[2]`) so the feed can name the owner offline.
- Team tab (supervisors only): invite by email, withdraw invitations, remove members, see seat usage. Removing = `is_active=false` + auth ban; `org_id` is kept so their events stay in the supervisor's feed. Re-inviting the same email reactivates them.

## Edge functions

| Function | JWT | Purpose |
|---|---|---|
| `revenuecat-webhook` | **no** (Authorization header = `RC_WEBHOOK_SECRET`) | re-fetches the subscriber, upserts `subscriptions` |
| `stripe-webhook` | **no** (Stripe signature) | re-retrieves the subscription, updates `organisations` / `subscriptions`, attaches the owner as supervisor on first activation |
| `create-checkout-session` | yes | `{kind:'enterprise', org_name, seats}` or `{kind:'individual'}` → Checkout URL |
| `create-billing-portal-session` | yes | Stripe Customer Portal URL (payment method, invoices, cancel) |
| `update-seats` | supervisor | `{seats}` ≥3 and ≥ seats in use → Stripe quantity + proration |
| `org-invite` | supervisor | emails a 14-day link `PORTAL_URL/invite/<token>`; reactivates a removed member |
| `org-revoke-invite` | supervisor | `{invite_id}` |
| `org-accept-invite` | **no** (token) | `{token, probe:true}` / `{token, full_name, job_title, password}` / `{token}` + bearer JWT for an existing account |
| `org-remove-member` | supervisor | `{user_id}` |
| `delete-account` | yes | `{confirm:true}` — individuals lose their data, members' events stay with the org, supervisors must cancel first |

Deploy the three no-JWT ones with `--no-verify-jwt` (also declared in `supabase/config.toml`):

```
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy org-accept-invite --no-verify-jwt
supabase functions deploy create-checkout-session create-billing-portal-session update-seats org-invite org-revoke-invite org-remove-member delete-account notify-admin generate-insights transcribe
```

Secrets (`supabase secrets set …`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_INDIVIDUAL`, `STRIPE_PRICE_SEAT`, `RC_WEBHOOK_SECRET`, `RC_SECRET_API_KEY`, `RESEND_API_KEY`, `NOTIFY_FROM` (verified domain), `PORTAL_URL` (`https://app.eventinsights.com.au`).

## One-time setup (client-owned)

1. **Legal entity, address, ABN, GST registration** — into Stripe Tax settings and `src/fixtures/legal.ts` (`ENTITY`).
2. **Stripe (AU)**: Tax on (origin AU, GST registration); products/prices *Individual* A$29.99/mo and *Enterprise seat* A$19.99/mo, both `tax_behavior = inclusive`; Billing → Emails → "Email finalized invoices" + receipts on; Customer Portal: payment method, invoice history, cancel — **no** quantity/plan changes (seat changes go through `update-seats`); webhook endpoint `…/functions/v1/stripe-webhook` for `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`.
3. **RevenueCat**: iOS + Android apps, entitlement `individual`, offering `default` with the monthly package, webhook → `…/functions/v1/revenuecat-webhook` with an Authorization header value; put the public SDK keys in `EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY` (EAS env + `.env`).
4. **App Store Connect**: subscription group + product `ei_individual_monthly` (A$29.99, 7-day introductory free trial), Paid Apps agreement, banking/tax, sandbox testers; Terms/Privacy URLs = `https://app.eventinsights.com.au/terms` / `/privacy`. Supabase Apple provider: add the bundle id to Client IDs. Apple secret JWT rotates 25 Jan 2027.
5. **Play Console**: subscription `ei_individual_monthly` (monthly base plan + 7-day free-trial offer), merchant account, license testers; Data safety → account deletion URL `https://app.eventinsights.com.au/account/delete`.
6. **DNS/email**: `app.eventinsights.com.au` → the `web/` build (any static host with SPA fallback); Resend domain verified and `NOTIFY_FROM` set — invitations do not deliver until then.
7. **Supabase dashboard**: enable Google + Apple providers; add `https://app.eventinsights.com.au/**` to redirect URLs; set the secrets above.
8. **Existing accounts** (testers, early users) hit the paywall on the first release: comp them with `insert into subscriptions (user_id, provider, status, access_until) values (<uid>, 'manual', 'manual', '2099-01-01')`.

## Web portal

`web/` — Vite SPA, env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional store links. Routes: `/` · `/enterprise/start` · `/individual/start` · `/checkout/success` · `/checkout/cancelled` · `/billing` (plan, seats, team, portal) · `/invite/:token` · `/account/delete` · `/terms` · `/privacy` · `/forgot-password`. Legal pages render `src/fixtures/legal.ts` — the same text as the app.

```
cd web && npm install && npm run build   # dist/ → static host
```

## Testing checklist

- `supabase db push` after a `supabase db dump`; then as a supervisor token: `select * from team_members`, read a member's event; `insert into interviewees` on it must fail.
- `stripe listen --forward-to https://sbyasmwhvqklvnvyoxko.supabase.co/functions/v1/stripe-webhook` + `stripe trigger checkout.session.completed`; replay the same event → `{duplicate:true}`.
- RevenueCat dashboard "send test webhook" → 200; sandbox purchase on a TestFlight / internal-track build → `subscriptions` row within seconds and the paywall clears.
- Two devices: supervisor A, member B. B logs an event → appears under A's Events "Team" within ~30 s with B's name; A opens it → no write buttons; A removes B → B locked out within the hour, events remain.
- Sign out on a device with pending sync is blocked until synced; sign in as a different user → SQLite wiped.

## Design notes and known limits (from the build audit, 28 Aug 2026)

- **Removed members keep `org_id`** so their events stay visible to the supervisor. Consequence: a removed member cannot later join another organisation or buy an Individual plan with the same account (`in_another_organisation` / `already_in_organisation`). Re-inviting the same email reactivates them. Releasing someone to another org would need event ownership to be snapshotted separately — not built.
- **Seat checks are not atomic.** Two invitations accepted in the same instant can overfill by one; treated as acceptable overage rather than a `for update` RPC.
- **Deleted accounts** keep a scrubbed profile row (`deleted_at`, `deleted-<uuid>@deleted.invalid`). The `on_auth_user_deleted` trigger (0030) scrubs on *every* auth deletion path, not just `delete-account`. Admin metrics and `team_members` exclude them.
- **Webhook idempotency:** `billing_events` rows are claimed on arrival and stamped `processed_at` on success; a failed run releases the claim so the provider's retry is processed; a claim older than 5 minutes with no stamp is re-processed (worker died). Both webhooks re-read the provider before writing, so reprocessing is safe.
- **Store subscriptions cancelled via `delete-account`:** we cannot cancel Apple/Google billing; the app tells the user to cancel in the store first.
- **Hosted auth must have email confirmations OFF** (as in `supabase/config.toml`) — the web sign-up → checkout flow needs `signUp` to return a session.
