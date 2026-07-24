# Architecture

## Roles & ownership
- **admin** — read-oversight of all events; approves transcripts; manages users and
  settings. Does not create events or add interviewees.
- **facilitator** — owns their events end to end. One facilitator per event
  (`events.owner_id`), so there is exactly one writer per row and last-write-wins
  is correct rather than a compromise.

## Offline capture path (the only thing that must work offline)
Events, questions, interviewees, consent, and answers are written to **local
SQLite** first and rendered optimistically. Every write also appends to
`sync_outbox` in the same transaction.

- **Push** (`src/lib/sync/outbox.ts`): drains the outbox in insertion order,
  upserting to Postgres. Client-generated UUIDs make retries idempotent. Stops on
  the first hard failure to preserve ordering (a question can't land before its event).
- **Upload** (`src/lib/sync/upload.ts`): audio + consent signatures upload to
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
  Derives a 0–100 **audio-quality** score (clarity, not accuracy) + per-segment
  flags. Scoring is confidence-aware: if the provider returns per-segment/word
  confidence or logprobs, that's the primary signal; otherwise it falls back to
  timing/empty-segment heuristics (score may be null → shown as "—"). The transcript
  score is a length-weighted mean reported alongside `flagged_segment_count` so one
  bad segment can't hide in a good mean. Recordings are 16 kHz mono AAC.
  Configurable via `TOGETHER_API_KEY`, `PARAKEET_MODEL`, `PARAKEET_API_URL`.
- **generate-insights** — loads all transcripts, **groups them by question** (all
  ~10 answers to Q1 together, etc.) so Claude sees the parallel answers side by
  side, and returns ≤5 insights each with ≥1 verbatim evidence quote + transcript id
  (structured output). Persists `insights` + `insight_evidence`.
- **generate-recommendations** — 1–3 recommendations linked to each insight.
- **invite-user** — admin-only invite.
- **purge-event-audio** — manual early deletion of a finalised event's audio.

Claude call shape (`_shared/anthropic.ts`): `claude-opus-4-8`, adaptive thinking,
`effort: high`, `output_config.format` JSON schema. No `temperature`/`top_p`/
`budget_tokens` (they 400 on this model).

## Approval & the quality score
70 transcripts/event makes approval the bottleneck, so the admin queue is
worst-first and supports **bulk-approve** of everything at/above the threshold with
zero flags. Individual review highlights the low-scoring spans. Admins can edit
inline + approve, or reject back to the facilitator with a note.

## Retention & deletion
- Auto: `purge_expired_audio` (pg_cron, daily) deletes audio 90 days after
  approval; window is admin-configurable.
- Manual: on a **finalised** event, the owner/admin can delete all audio early. The
  export screen enforces an **export-first safeguard** — if no transcript-inclusive
  export exists, it offers to generate one before deleting, so the interview record
  survives. Transcripts/insights are always kept.

## Privacy
- Data rests in Sydney. AI processing (Whisper/Claude) occurs in the US — disclosed
  in the consent text and privacy policy (Privacy Act APP 8).
- RLS on every table; private Storage buckets, signed URLs only; secrets only in
  Edge Function env; auth tokens in `expo-secure-store`; no public sign-up.
