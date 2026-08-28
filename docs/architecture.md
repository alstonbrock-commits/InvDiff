# Architecture

## Roles & ownership
- **admin** — read-oversight of all events; approves transcripts; manages users and
  settings. Does not create events or add interviewees.
- **facilitator** — owns their events end to end. One facilitator per event
  (`events.owner_id`), so there is exactly one writer per row and last-write-wins
  is correct rather than a compromise.
- **Enterprise organisations (Aug 2026)** — a facilitator may also be an
  organisation's `supervisor` or `member` (`profiles.org_id` / `org_role`).
  Supervisors get read-only visibility of every member's events through
  `can_read_event()`; write policies are unchanged. Plans, entitlement, seats,
  invitations and the web portal are described in `billing-and-enterprise.md`.

## Offline capture path (the only thing that must work offline)
Events, questions, interviewees, and answers are written to **local
SQLite** first and rendered optimistically. Every write also appends to
`sync_outbox` in the same transaction.

- **Push** (`src/lib/sync/outbox.ts`): drains the outbox in insertion order,
  upserting to Postgres. Client-generated UUIDs make retries idempotent. Stops on
  the first hard failure to preserve ordering (a question can't land before its event).
- **Upload** (`src/lib/sync/upload.ts`): audio + event photos upload to
  Storage separately from row sync (blobs never go through the outbox). On success
  the answer flips to `uploaded` and transcription is triggered.
- **Pull** (`src/lib/sync/pull.ts`): merges server rows into local, skipping any
  row that still has a pending outbox entry so un-pushed local edits are never clobbered.
- **Engine** (`src/lib/sync/engine.ts`): single-flight `push → upload → pull`, run
  on reconnect, on foreground, and every 30s. `SyncProvider` wires it to NetInfo.

Online-only data (transcripts, approvals, insights, recommendations, exports) is
read straight from Supabase via `src/lib/remote.ts` — no local mirror.

## AI pipeline (server-side; keys never on device)
Edge Functions in `supabase/functions/`:
- **transcribe** — NVIDIA **Parakeet** (`nvidia/parakeet-tdt-0.6b-v3`) hosted on
  **Together AI** via the OpenAI-compatible `/v1/audio/transcriptions` endpoint.
  Writes plain transcript text. (A confidence/quality-score subsystem existed but
  was removed in migration 0010 — Together's endpoint returns no confidence data,
  so the scores were always null.) Recordings are 16 kHz mono AAC (or wav from the
  live-caption path). Configurable via `TOGETHER_API_KEY`, `PARAKEET_MODEL`,
  `PARAKEET_API_URL`.
- **generate-insights** — loads all transcripts, **groups them by question** (all
  ~10 answers to Q1 together, etc.) so Claude sees the parallel answers side by
  side, and returns ≤5 insights each with ≥1 verbatim evidence quote + transcript id
  (structured output). Persists `insights` + `insight_evidence`.
- **generate-recommendations** — 1–3 recommendations linked to each insight.
- **invite-user** — admin-only invite.
- **purge-event-audio** — manual early deletion of a finalised event's audio.
- **notify-admin** — emails the admin (via Resend) when a facilitator logs an event;
  respects `app_settings.email_notifications` / `admin_email`.

Claude call shape (`_shared/anthropic.ts`): `claude-opus-4-8`, adaptive thinking,
`effort: high`, `output_config.format` JSON schema. No `temperature`/`top_p`/
`budget_tokens` (they 400 on this model).

## Approval & insight generation (user-driven)
The facilitator reviews each interview's transcripts in-app (tap a line to
correct it) and approves them. Approving never auto-generates: the app asks
"are there more interviews to run?" — *More interviews* returns to the roster;
*No — generate insight* runs the generation after two gates (every recorded
answer approved; a confirm listing any rostered people who were never
interviewed). The roster screen also has an explicit **Generate insight**
button once everyone on it has recorded (`src/lib/insightFlow.ts` is the shared
sequence: generate → finalise → sync → notify). On a finalised event the
approve screen's action regenerates the insight from corrected text, as before.
Rejection sends the transcript back with a note.

An interview session may be **joint** — several people answering together. It
stays one `interviewees` row with the names joined by `" & "`
(`src/lib/names.ts`); transcripts, prompts, and counts treat it as one
interview, which matches the single unlabelled audio stream Parakeet returns.

## Retention & deletion
Server audio is **transient**: `generate-insights` purges the event's audio
(Storage removal + `purge_event_audio` RPC, source `auto_report`) as soon as the
report persists — recordings exist server-side only long enough to transcribe
and synthesise. Layers:
- Backstop: the `purge-expired-audio` Edge Function (invoked nightly by pg_cron
  via pg_net, migration 0027) deletes audio N days after approval
  (admin-configurable, 90 default) — only reached by events that never produce
  a report. ⚠ Supabase rejects `delete from storage.objects` in SQL, so every
  object removal goes through the Storage API; SQL functions
  (`purge_event_audio`, `stamp_audio_purged`) only stamp rows.
- Manual: the `purge-event-audio` Edge Function remains as an operator tool for
  finalised events (no in-app UI calls it).
- Device: each recording is kept locally as the fallback copy and deleted by
  `localAudioSweep` 7 days after the event's report (files whose upload is
  still pending are never touched). Uploads are compressed on-device first
  (`compressTake`, react-native-compressor; wav fallback if unavailable).
Transcripts/insights are always kept.

## Privacy
- Data rests in Sydney. AI processing (Parakeet via Together AI / Claude via Anthropic) occurs in the US — disclosed
  in the privacy policy and the consent the facilitator obtains before recording (Privacy Act APP 8).
- RLS on every table; private Storage buckets, signed URLs only; secrets only in
  Edge Function env; auth tokens in `expo-secure-store`; open self-registration (facilitator by default; the app_settings.admin_email account becomes admin).
