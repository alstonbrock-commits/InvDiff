# Privacy & Store Submission Checklist

## Cross-border processing disclosure (REQUIRED)
Data rests in Sydney, but audio and transcripts are sent to **OpenAI (Whisper)** and
**Anthropic (Claude)** in the **United States** for processing. Under the Australian
Privacy Act **APP 8** this cross-border disclosure must appear in:
- the **consent text** shown to each interviewee (Admin → Settings), and
- the **privacy policy** published for the app listings.

Sample clause (have it legally reviewed):
> "Audio recordings and their transcripts are processed by third-party AI providers
> located outside Australia (in the United States) for the purposes of transcription
> and analysis. By consenting, you acknowledge this overseas disclosure."

## Privacy policy — must cover
- What is collected: name/segment, audio recordings, transcripts, on-screen consent
  signature + timestamp, account email.
- Purpose: interview capture, transcription, AI-assisted analysis, reporting.
- Overseas disclosure (above).
- Retention: audio auto-deleted 90 days after approval (configurable); transcripts
  retained; manual early deletion available.
- Access & deletion: how a data subject requests access/deletion (admin performs it).
- Security: encryption in transit, private storage, access controls.

## iOS (App Store Connect)
- `PrivacyInfo.xcprivacy` — declare microphone use; no tracking.
- Info.plist: `NSMicrophoneUsageDescription` (set in `app.config.ts`).
- App Privacy questionnaire: Audio Data, User Content, Contact Info (email) —
  collected, linked to user, not used for tracking.
- Review notes: provide a demo admin + facilitator account and a short script
  (create event → add interviewee → consent → record → approve → insights → export).

## Android (Google Play Console)
- Data Safety form: microphone/audio, personal info (name/email), user content;
  encrypted in transit; deletion available.
- Permissions: `RECORD_AUDIO`, `INTERNET` (declared in `app.config.ts`).
- Internal testing track for review before production.

## EAS
- `eas.json` — fill in `appleId`, `ascAppId`, `appleTeamId`, and the Play service
  account JSON path before `eas submit`.
- Bump `ios.buildNumber` / `android.versionCode` per submission (production profile
  auto-increments).

## Pre-submission smoke test
Run the full field flow on a physical device on both platforms via TestFlight /
Play internal testing, including an **offline** capture of a full 10×7 event followed
by reconnect + upload of all ~70 recordings.
