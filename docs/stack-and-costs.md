# Event Insight — Stack & Cost Analysis

*Prepared 24 August 2026. All service prices in USD unless noted; providers bill in USD.*

## External services

| Service | What it does here | Where in the code | Plan / price |
|---|---|---|---|
| **Supabase** (Sydney, ap-southeast-2) | Postgres database, Auth (email+password), file Storage (audio/photos), Edge Functions (the AI pipeline) | `supabase/config.toml`, `src/lib/supabase.ts` | Free: $0 (500 MB DB, 1 GB storage, 500K function invocations, 5 GB egress; pauses after 1 week idle). Pro: $25/mo (8 GB DB, 100 GB storage, 2M invocations) |
| **Together AI** — NVIDIA Parakeet ASR | Transcribes each recorded answer (`nvidia/parakeet-tdt-0.6b-v3`) | `supabase/functions/transcribe/index.ts` | $1.50 per 1,000 audio minutes (**$0.0015/min**), pay-as-you-go |
| **Anthropic** — Claude Opus 4.8 | One synthesis call per report: insights, recommendations, executive summary (structured output, ≤16K output tokens) | `supabase/functions/_shared/anthropic.ts`, `generate-insights/` | **$5 / 1M input tokens, $25 / 1M output tokens**, pay-as-you-go |
| **Resend** | Admin email notification when an event is logged; (planned) custom SMTP for branded auth emails | `supabase/functions/notify-admin/` | Free: 3,000 emails/mo (100/day). Paid from $20/mo — free tier is ample here |
| **Expo / EAS** | React Native framework, dev builds, store distribution | `app.config.ts`, `package.json` | Free: 15 Android + 15 iOS builds/mo, OTA updates to 1,000 MAU. Production: $199/mo + usage (only needed at real scale) |
| **Android speech recognition** | Live caption preview while recording (on-device/Google service) | `src/lib/liveCaptions.ts` (expo-speech-recognition) | Free |
| **Google Fonts** (bundled) | Archivo, Public Sans, IBM Plex Mono — shipped in the app binary | `package.json` | Free |
| **Domain** — `eventinsights.com.au` | Registered 24 Aug 2026 by the client. Web presence now lives at `eventinsight.baprojects.com.au` (Brock's umbrella domain, one subdomain per project); eventinsights.com.au is optional — could later redirect here | — | ~AU$15–35/yr typical .com.au renewal |

**Data residency note:** app data rests in Sydney (Supabase). AI processing (Together AI, Anthropic) occurs in the US — disclosed in the privacy policy and pre-recording consent (Privacy Act APP 8). See `docs/privacy-and-store.md`.

## Build & component outline

**App (Expo React Native, expo-router):**
- `app/(auth)/` — sign-in / sign-up (+ root-level `forgot-password` with emailed 6-digit code)
- `app/(tabs)/` — facilitator home: Dashboard, Events, Insights, Account
- `app/(admin)/` — admin oversight: Dashboard, Reports, Users, Settings
- Flow screens: `log-new-event` → `select-interviewee` (event hub) → `recorded-interview` → `approve-transcript` → `insight-detail`
- `src/components/` — brand UI kit (Field, Button, dialogs, cards, tiles)

**Offline-first capture** (`src/lib/db/` + `src/lib/sync/`): events, questions, interviewees, answers write to local SQLite first; an outbox pushes rows to Postgres in order on reconnect; audio/photos upload separately; a pull merge brings server rows back. Recording works with no reception; only approval/insights need the network.

**Server AI pipeline** (`supabase/functions/`, keys never on device):
1. `transcribe` — audio → Parakeet → transcript text (per answer)
2. `generate-insights` — all approved transcripts, grouped by question → one Claude Opus 4.8 structured call → report + ≤5 insights + ≤3 recommendations (queued via `ai_jobs`, ~1 min)
3. Supporting: `notify-admin` (Resend email), `invite-user`, `purge-event-audio` (+ 90-day auto-purge)

## Cost per report — measured

**Benchmark run 26 Aug 2026** on the live pipeline: a top-end event of **10 interviews × 7 questions ≈ 44 audio minutes** (5,101 transcript words). Claude usage from the Anthropic console: **13,209 input / 5,616 output tokens**.

| Cost driver | Measured working | Cost |
|---|---|---|
| Transcription (Parakeet) | 44.1 min × $0.0015 | **$0.066** |
| Claude input | 13,209 tokens × $5/M | **$0.066** |
| Claude output | 5,616 tokens × $25/M | **$0.140** |
| Storage/egress | ~14 MB audio (32 kbps mono), purged after 90 days | ≈ $0 (within plan) |
| Email notification | 1 Resend email | $0 (free tier) |
| **Top-end report, all-in** | | **≈ $0.27 (~AU$0.38 at ~1.40)** |

A **typical 5-interview event ≈ $0.20**: transcription and Claude input halve, but the output side (the report itself) stays roughly constant regardless of interview count. Real speech is wordier than the benchmark's scripted answers (~+2.5K input tokens for the same minutes) — worth about one extra cent. Each **regeneration** after correcting transcripts repeats only the Claude call: **~$0.21**.

## How it scales

Fixed monthly baseline once in production: **Supabase Pro $25** (recommended — the free tier pauses when idle and holds only ~1 GB of audio) + domain (~AU$2.50/mo amortised). Resend and EAS stay $0 at this scale.

All rows priced at the measured **top-end** $0.27 per report — typical 5-interview events cost less.

| Reports / month | AI + transcription (marginal) | Fixed costs | Total / month | **Cost per report** |
|---|---|---|---|---|
| 10 | ~$2.70 | $25 | ~$28 | **~$2.77** |
| 50 | ~$13.50 | $25 | ~$39 | **~$0.77** |
| 200 | ~$54 | $25 | ~$79 | **~$0.40** |
| 1,000 | ~$270 | $25–50* | ~$300–320 | **~$0.30** |

\* Storage & egress (post audio-lifecycle rework, Aug 2026): uploads are compressed on-device (~21 MB per top-end event; WAV only as a fallback when the compressor is unavailable) and server audio is purged the moment the report generates, so steady-state storage is just in-flight events — near zero — plus the admin-configurable backstop (90-day default) for events that never produce a report. Egress to the transcriber ≈ 21 GB per 1,000 reports, inside Pro's included quota far past any realistic volume. Transcripts/insights text is kilobytes per event against the 8 GB database.

**Cost per user:** `$25 ÷ active users + $0.20–0.27 × reports per user`. At 4 reports/user/month: 1 user ≈ $26, 5 users ≈ $6.10 each, 20 users ≈ $2.35 each, 50 users ≈ $1.58 each — the $25 floor dominates until there's a handful of users, then each extra user costs about a dollar a month plus their reports.

**The shape of the curve:** cost per report falls toward the ~$0.27 measured floor as fixed costs amortise. There is no step-change until either (a) audio retention outgrows Supabase Pro storage (~7,500 reports in any 90-day window), or (b) app distribution needs EAS Production ($199/mo) — a distribution decision, not a per-report cost.

### Scenario: 1,000 users × 10 top-end reports/mo

Reflects the audio-lifecycle rework (Aug 2026): compressed uploads, server audio purged at report generation, 7-day device-side fallback copy.

| Item | Working | Monthly |
|---|---|---|
| Claude Opus 4.8 | 10,000 × $0.206 measured | **$2,060** |
| Parakeet | 441,000 audio min × $0.0015 (billed by minutes — compression doesn't change it) | **$661** |
| Supabase Pro + compute bump | ~1,000 syncing devices → one instance tier up | ~$40–85 |
| Supabase storage & egress | audio transient on server; ~210 GB/mo egress of compressed uploads (within quota) | ≈ $0 |
| Resend (10K notification emails) | $20 tier | $20 |
| **Total** | | **≈ $2,750/mo → ~$2.75/user, ~$0.28/report** |

The remaining meaningful lever is **synthesis model choice** — Opus 4.8 is ~$2,060 of the total; Sonnet 5 would run ~$0.124/report (~$820/mo saved) and Haiku 4.5 ~$0.04/report, pending a side-by-side report-quality test.

**Ways to cut the marginal cost later, if it matters:** shorten the 90-day audio retention (storage), reduce `max_insights` (slightly shorter output), or move synthesis to a cheaper Claude tier (quality trade-off — not recommended while report quality is the product).

## Pending ops checklist

- [ ] Supabase dashboard → Authentication → Email Templates → *Reset Password*: include `{{ .Token }}` (6-digit code) — required for the in-app forgot-password flow (local template: `supabase/templates/recovery.html`)
- [ ] Sending domain: verify `baprojects.com.au` (or the client's `eventinsights.com.au`) in Resend (SPF/DKIM), then Supabase custom SMTP so auth emails send from a real domain; site DNS: CNAME `eventinsight.baprojects.com.au` → static host
- [ ] Swap in-app website/support links to the new domain when the client confirms
