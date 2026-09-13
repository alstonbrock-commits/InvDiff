# Billing and the free first report

_Rewritten 13 Sep 2026 (solo pivot). Companion to `architecture.md`._

## The model

One plan, solo use only: **A$19.99 / month incl. GST**, bought **only in the app** through Apple's App Store or Google Play (RevenueCat fronts both stores). There is **no Stripe, no web checkout, no enterprise/team tier** — that code was removed on 13 Sep 2026 (see git history on `production-billing` if it's ever needed again).

Instead of a time trial, **every new account may generate one insight report free**. `profiles.free_report_used_at` is stamped by `generate-insights` when the first report persists (for every account — the column means "has generated at least one report"). After that, without a subscription the app is **view-only**: everything already captured stays visible and the free report's PDF stays shareable, but recording, logging new events and generating reports prompt the subscribe screen.

Tax invoices: Apple/Google are merchant of record and issue the receipt/tax invoice for every payment. **We issue none** — stated in Terms §8.

## How access is decided

`my_entitlement()` (migration 0029) returns one of:
- `admin` — always active;
- `individual` — active while `subscriptions.access_until > now()` (webhook writes period end + 24 h grace);
- `free` — active; the free report is still available;
- `none` — view-only (free report used, no subscription).

The app caches the last answer (`entitlement-cache:<uid>`) so a field device without reception still opens, and RevenueCat's SDK unlocks instantly after a purchase before the webhook lands.

There is **no paywall interstitial**: the routing gate (`src/lib/gate.ts`) is login → admin → complete-profile → deactivated? → onboarding → app. The subscribe screen (`app/paywall.tsx`) opens on demand — from locked actions via `promptSubscribe()` (`src/lib/paywallPrompt.ts`) and from the Account tab. Locked when `!useEntitlement().active`: Log new event (Dashboard), Start/Resume interview and Generate insight (roster), Approve (approve screen), Try again (Insights tab).

Server-side the plan is enforced where money is spent: `transcribe` and `generate-insights` call `has_active_plan_for(owner)` (true for admin / subscriber / unused free credit) and return **402 `subscription_required`**. Deliberately no RLS write gating — the offline outbox halts on the first rejected row.

## Data model & functions

- `subscriptions` (one row per user; provider `apple | google | manual` — `manual` = operator comp), `billing_events` (webhook idempotency: claim → `processed_at`; 5-min re-claim; release on failure), `profiles.onboarded_at`, `profiles.free_report_used_at`, `profiles.deleted_at` (0030 scrub).
- Edge functions: `revenuecat-webhook` (**deploy `--no-verify-jwt`**, Authorization header = `RC_WEBHOOK_SECRET`; re-fetches the subscriber and upserts `subscriptions`), `delete-account`, plus the existing `transcribe`, `generate-insights`, `notify-admin`, `purge-expired-audio` (`--no-verify-jwt`).
- Secrets: `RC_WEBHOOK_SECRET`, `RC_SECRET_API_KEY`, `RESEND_API_KEY`, `NOTIFY_FROM` (+ the existing `ANTHROPIC_API_KEY`, `TOGETHER_API_KEY`). No Stripe secrets, no `PORTAL_URL`.

```
supabase db push                                  # 0028 billing, 0029 entitlement, 0030 detach
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy purge-expired-audio --no-verify-jwt
supabase functions deploy delete-account notify-admin generate-insights transcribe
```

## One-time setup

1. Legal entity / ABN / address into `src/fixtures/legal.ts` (`ENTITY`) + lawyer review of Terms/Privacy.
2. **App Store Connect**: Paid Apps agreement + banking; subscription group + `ei_individual_monthly` at **A$19.99, no introductory offer** (the free report replaces the trial); sandbox testers; Terms/Privacy URLs from the website.
3. **Play Console**: payments profile; subscription `ei_individual_monthly` base plan monthly **A$19.99, no free-trial offer**; license testers; Data safety deletion URL.
4. **RevenueCat**: entitlement `individual`, offering `default` (monthly package), webhook + keys (`EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY`).
5. **Website** (`web/`): static Vite site — `/`, `/terms`, `/privacy`, `/account/delete`, `/forgot-password` only. Host at `eventinsight.baprojects.com.au`; env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, store URLs when live.
6. Resend domain verification (welcome + admin-notification emails; nothing launch-blocking depends on it any more).
7. Comp existing testers: `insert into subscriptions (user_id, provider, status, access_until) values ('<uid>', 'manual', 'manual', '2099-01-01');`

## Testing checklist

- Fresh account: sign up → onboarding → full capture → **first report generates without paying** → `free_report_used_at` stamped → app drops to view-only (record/generate prompt the subscribe screen; the report still opens and shares).
- Sandbox purchase (iOS sandbox tester / Play license tester): subscribe from the prompt → `subscriptions` row within seconds → recording unlocked; Restore purchases after reinstall; cancel in sandbox → view-only returns after expiry.
- `transcribe`/`generate-insights` return 402 for a view-only account (hand-called), and the app routes that to the subscribe prompt.
- RevenueCat "send test webhook" → 200 `ignored: test event`; replay of a real event → `duplicate: true`.
- Google Play closed test (12 testers / 14 days) still applies for a personal Play account — testers each get a working free report, which doubles as real engagement for the production-access questionnaire.
