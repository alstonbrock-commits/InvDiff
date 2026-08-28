> **STATUS (2026-08-22): NOT IN USE.** Google and Apple sign-up were removed
> from the app — accounts are email + password only. The provider config below
> is still valid and remains set up in Supabase and the Apple/Google consoles,
> so re-enabling is a UI change plus flipping the providers back on. The Apple
> secret still expires 25 Jan 2027 if you intend to keep that option open.

# Google & Apple sign-in — setup walkthrough

The app side is done: the sign-up screen's Google/Apple buttons run a PKCE
browser flow that redirects back to `interviewinsights://auth-callback`, and the
typed name/job title are applied to the new profile when the session lands.
What remains is creating credentials in the two developer consoles and pasting
them into the Supabase dashboard. Everything below is console clickwork — none
of it requires an app rebuild.

Project ref: `sbyasmwhvqklvnvyoxko`
Callback URL (used by BOTH providers):
`https://sbyasmwhvqklvnvyoxko.supabase.co/auth/v1/callback`

---

## Step 0 — Supabase redirect allow-list (do this first)

Dashboard → Authentication → **URL Configuration**:

- Site URL: `interviewinsights://`
- Redirect URLs — add: `interviewinsights://auth-callback`

Without this, every provider flow ends with a "redirect not allowed" error.

---

## Step 1 — Google (detailed walkthrough)

No payment needed — Google Cloud's free tier covers OAuth entirely. (The
US$25 Play Console fee is a separate thing, only needed for a store launch.)

### Part A — Account + project

1. Go to https://console.cloud.google.com and sign in with the Google account
   that should OWN this configuration long-term (the admin account is the
   natural choice). First visit asks you to accept terms — no billing setup.
2. Top bar → project dropdown (says "Select a project") → **New project** →
   Project name: `Event Insight` → **Create**. Wait for the notification,
   then make sure the top-bar picker shows *Event Insight* selected.

### Part B — Consent screen (what users see)

1. ☰ menu → **APIs & Services** → **OAuth consent screen** (Google now
   redirects this to the **Google Auth Platform** — same thing). Click
   **Get started**.
2. Fill the wizard:
   - **App name**: `Event Insight` (shown on the Google sign-in page)
   - **User support email**: your email
   - **Audience**: **External**
   - **Contact information**: your email → agree → **Create** / **Finish**.
3. In the **Audience** section afterwards: click **Publish app** → confirm.
   (While unpublished, only listed test users can sign in. Publishing with
   just the default email/profile/openid scopes requires NO Google review.)

### Part C — The OAuth client

1. In Google Auth Platform → **Clients** → **Create client**
   (equivalently: APIs & Services → Credentials → **+ Create credentials** →
   **OAuth client ID**).
2. **Application type**: **Web application** — yes, web: Supabase's server is
   the thing performing OAuth, not the phone. No Android client, no SHA-1.
3. **Name**: `Supabase`.
4. **Authorized JavaScript origins**: leave empty (not used by this flow).
5. **Authorized redirect URIs** → **+ Add URI**:
   `https://sbyasmwhvqklvnvyoxko.supabase.co/auth/v1/callback`
6. **Create** → a dialog shows the **Client ID**
   (`…apps.googleusercontent.com`) and **Client secret** (`GOCSPX-…`).
   Copy both now (they remain viewable under Clients later).

### Part D — Supabase dashboard

1. https://supabase.com/dashboard/project/sbyasmwhvqklvnvyoxko →
   Authentication → **Sign In / Providers** → **Google**.
2. **Enable**, paste **Client ID** and **Client Secret**. Leave any
   "Client IDs" list / "Skip nonce check" fields alone (native-flow only).
3. **Save**.

Unlike Apple, Google's secret does not expire on a schedule — no rotation
calendar needed.

## Step 2 — Apple (detailed walkthrough)

Everything happens at https://developer.apple.com/account → **Certificates,
Identifiers & Profiles** (left sidebar after you sign in). You will collect
four values as you go — write them down:

| Value | Where it comes from | Example shape |
|---|---|---|
| Team ID | Membership details | `A1B2C3D4E5` (10 chars) |
| Services ID | Part C below | `com.investigationsdifferently.eventinsight.auth` |
| Key ID | Part D below | `ABC123DEFG` (10 chars) |
| `.p8` file | Part D below | `AuthKey_ABC123DEFG.p8` |

### Part A — Team ID (30 seconds)

1. https://developer.apple.com/account → scroll to **Membership details**
   (or top-right account menu).
2. Copy the **Team ID** — 10 alphanumeric characters.

### Part B — App ID

1. **Identifiers** → blue **+** button.
2. Select **App IDs** → Continue → type **App** → Continue.
3. Fill in:
   - **Description**: `Event Insight` (internal label, anything works)
   - **Bundle ID**: select **Explicit**, enter exactly
     `com.investigationsdifferently.eventinsight`
4. In the **Capabilities** list, scroll down and **tick "Sign In with Apple"**.
   (Leave its Edit/Configure alone — the default "Enable as a primary App ID"
   is correct. Do NOT set server-to-server notification URLs; Supabase doesn't
   use them.)
5. **Continue** → **Register**.

### Part C — Services ID (the value the app actually signs in as)

This is a TWO-pass step: create it first, then edit it to configure the URLs —
the URL fields do not appear during creation.

**Pass 1 — create:**
1. **Identifiers** → **+** again.
2. This time select **Services IDs** → Continue.
3. Fill in:
   - **Description**: `Event Insight` — ⚠ this string is SHOWN TO USERS on
     Apple's sign-in page ("Use your Apple ID to sign in to *Event Insight*"),
     so make it the product name, not an internal label.
   - **Identifier**: `com.investigationsdifferently.eventinsight.auth`
4. **Continue** → **Register**.

**Pass 2 — configure:**
1. Back in **Identifiers**, switch the filter (top-right dropdown) from
   "App IDs" to **"Services IDs"**, and click the one you just made.
2. Tick the **Sign In with Apple** checkbox → click **Configure** next to it.
3. In the sheet that opens:
   - **Primary App ID**: pick `com.investigationsdifferently.eventinsight`
     (the App ID from Part B).
   - **Domains and Subdomains**: `sbyasmwhvqklvnvyoxko.supabase.co`
     (no `https://`, no trailing slash)
   - **Return URLs**: `https://sbyasmwhvqklvnvyoxko.supabase.co/auth/v1/callback`
     (this one DOES include `https://`)
4. **Next** → **Done** → **Continue** → **Save**. (Apple makes you confirm
   twice — the config isn't saved until the final Save on the identifier page.)

### Part D — Signing key (.p8)

1. **Keys** (left sidebar) → **+**.
2. **Key Name**: `Supabase Sign in with Apple`.
3. Tick **Sign In with Apple** → click **Configure** next to it →
   **Primary App ID**: pick `com.investigationsdifferently.eventinsight` →
   **Save**.
4. **Continue** → **Register**.
5. **Download** the `AuthKey_XXXXXXXXXX.p8` file. ⚠ **Apple offers this
   download exactly once.** Store it somewhere safe (password manager /
   private drive) — you need the same file again every 6 months.
6. Copy the **Key ID** shown on the same page (also embedded in the filename).

### Part E — Supabase dashboard

1. https://supabase.com/dashboard/project/sbyasmwhvqklvnvyoxko →
   **Authentication** → **Sign In / Providers** → **Apple**.
2. Toggle **Enable Sign in with Apple** on.
3. **Client IDs**: `com.investigationsdifferently.eventinsight.auth`
   (the Services ID. If a native iOS build is added later, keep this Services
   ID as the FIRST entry and append the bundle ID after a comma.)
4. **Secret Key**: this must be a signed JWT, not the `.p8` itself.
   **Easiest: `node scripts/apple-secret.js 4S9RY2TPT2`** — reads
   `Keys/AuthKey_A624MKPQ9Q.p8` (gitignored) and prints the JWT + its expiry.
   Or use the tool embedded in Supabase's docs page:
   - Open https://supabase.com/docs/guides/auth/social-login/auth-apple and
     scroll to the secret **generator tool** (⚠ it doesn't work in Safari —
     use Chrome/Edge/Firefox; keys never leave the browser).
   - Feed it: **Team ID** (Part A), **Services ID** (Part C), **Key ID**
     (Part D), and the **contents of the `.p8` file** (open it in a text
     editor and paste, including the BEGIN/END lines).
   - Copy the generated JWT (a long `eyJ…` string) → paste into the Supabase
     **Secret Key** field.
5. **Save**.
6. ⚠ **The JWT expires after 6 months** (Apple's rule). Set a calendar
   reminder now: rerun the generator with the SAME `.p8` and paste the new
   JWT over the old one. If the `.p8` is ever lost or leaked: revoke the key
   in Apple's Keys page and repeat Part D.

### Apple gotchas worth knowing

- **Name only arrives on the very first authorisation.** Apple returns the
  user's name once and `null` forever after. Our sign-up flow already
  compensates (the typed name from the sign-up screen is applied to the
  profile), so nothing to do — just don't be surprised in testing.
- **Re-testing "first sign-in":** on an iPhone go to Settings → Apple ID →
  Sign-In & Security → Sign in with Apple (or appleid.apple.com → Sign-In and
  Security) and remove "Event Insight"; the next sign-in counts as first.
- **Hide My Email**: users may get a relay address like `x@privaterelay.appleid.com`
  — that becomes their account email in Supabase. Fine functionally. (Sending
  email TO relay addresses — e.g. invites — needs domain registration under
  **Services → Sign in with Apple for Email Communication**; skip until needed.)

## Step 3 — Verify on the phone

1. App → Create account → fill name + email → tap **Google** (or Apple).
2. Custom tab opens the provider page → sign in → it bounces through
   `…supabase.co/auth/v1/callback` → back into the app.
3. You land on the facilitator dashboard; Account tab shows the typed name and
   job title. (The account's email is whatever the provider returns.)

Failure modes:
- "redirect not allowed" → Step 0 not done, or a typo in the scheme.
- Google "access blocked" → consent screen unpublished and your account isn't
  a test user.
- Apple "invalid_client" → Services ID mismatch or the secret JWT expired/was
  generated against the wrong key.

## Launch-readiness

Everything above IS the production setup — nothing here is throwaway, and none
of it needs redoing at launch. But note:

- **The bundle ID becomes permanent the moment an app ships with it.** The
  Apple App ID you register in Part B and the Play listing later must match
  `com.investigationsdifferently.eventinsight` forever. Confirm you're happy
  with that identifier BEFORE Part B — renaming later means new identifiers,
  new Services ID config, and a new app listing. (The
  `.auth` Services ID and the `interviewinsights://` scheme can stay as they
  are regardless.)
- The OAuth pieces work identically in a release build: the redirect scheme is
  compiled into the app, and the Supabase callback URL never changes.
- What an actual store launch adds later (separate task, nothing blocks it):
  - **Apple**: App Store Connect record on the same App ID; the native
    Sign-in-with-Apple button (`expo-apple-authentication`) — App Review
    requires it for iOS builds that offer social login; EAS handles signing.
  - **Google**: Play Console account (US$25 once), same package name; publish
    the OAuth consent screen to Production (basic email/profile scopes need no
    Google review).
  - **App**: replace the PLACEHOLDER consent text in app_settings, set
    RESEND_API_KEY if email notifications are wanted, bump version in
    app.config.ts, `eas build` release profiles.

## Notes

- Returning users: the same buttons on the sign-up screen sign existing
  accounts straight in; the typed name/job title are ignored unless the account
  was created in the last 15 minutes (guard in `src/lib/auth.tsx`).
- iOS later: App Store review requires the native Apple button
  (`expo-apple-authentication`) — separate task, Android is unaffected.
- `supabase/config.toml` mirrors the redirect list for local dev, but hosted
  provider config lives in the dashboard — the CLI does not reliably push
  `[auth.external.*]` to hosted projects.
