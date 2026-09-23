# Event Insight — Design Spec

Mobile app for **Event Insight**, by **Investigations Differently**. Supervisors and
investigators log workplace events on site, run a set list of interview questions while
recording, approve the transcript, and read the AI-generated insight for the event.

**Primary user:** supervisor / investigator.
**Must work offline** — worksites have poor reception; events and recordings queue on
device and sync later.

`screens-reference.html` is the visual source of truth. This file explains intent,
states, and behaviour. Where they disagree, the reference file wins.

---

## 1. Design tokens

| Token          | Value     | Use |
|----------------|-----------|-----|
| Signal Orange  | `#E4772A` | Primary accent — "Event" in the wordmark, CTAs, needs-review status, active tab |
| Ink Navy       | `#1B2B3A` | Headers, dark surfaces |
| Ink (text)     | `#17262D` | Primary text; also the darkest screen bg (`#0F1E24` for the modal scrim) |
| Insight Teal   | `#2CA5C0` | Secondary — completed status, AI badges, section eyebrows on light, links |
| Eyebrow Teal   | `#7FC4D6` | Mono eyebrow text on navy |
| Paper          | `#F6F5F1` | Screen background |
| White          | `#FFFFFF` | Cards, tab bar |
| Slate          | `#5D6B70` | Secondary text |
| Muted          | `#8A9499` | Tertiary text, mono labels, inactive tab labels |
| Border         | `#E5E3DC` | Card borders, dividers (inner dividers `#EFEDE7`) |
| Tab inactive   | `#D8DDDE` | Inactive tab icon |
| Dashed border  | `#C7C3B9` | "Add" affordances, chevrons |
| Navy field     | `#22333F` | Input fill on navy surfaces |
| Navy hairline  | `#33474F` | Dividers on navy |

Status tints: orange `rgba(228,119,42,0.12)`–`0.16`, teal `rgba(44,165,192,0.12)`–`0.14`.

**Type**
- **Archivo** 700/800 — wordmark, screen titles, numbers, buttons. Tight tracking
  (-0.02em to -0.03em) at large sizes.
- **Public Sans** 400/500/600/700 — body, labels, list rows.
- **IBM Plex Mono** 400/500 — eyebrows, event IDs, timestamps, status-bar time.
  Uppercase with wide tracking (0.18em–0.315em).

**Geometry**
- Cards, inputs, buttons: radius 11–12px. Screen corners 34px. Pills: 20px.
- Cards are white with a 1px `#E5E3DC` border — no shadows inside screens.
- Status bar row is 44px tall.
- Tab bar: white, 1px top border, padding `12px 0 16px`.

---

## 2. Components

Build these first; screens should be composition only.

- **`StatusBar`** — mono "9:41" left; battery glyph right; on some screens an avatar dot.
  Light variant (slate on paper) and dark variant (`#C6D4D9` on navy).
- **`ScreenHeader`** — navy block. Variants: (a) **brand** — wordmark + eyebrow +
  faded ID watermark (Dashboard, Login); (b) **titled** — back chevron `‹` + Archivo
  title, optional mono subtitle; (c) **tab title** — large title + optional search field.
- **`Watermark`** — `assets/id-mark.png` absolutely positioned, `object-fit: contain`,
  `opacity: 0.1`, bleeding off the top-right of a navy header with `overflow: hidden`.
- **`Wordmark`** — "Event" orange + "Insight" white/ink, Archivo 800.
- **`StatTile`** — number in Archivo 800 22px (teal for completed, orange for needs
  review) + caption in Public Sans 11px `#5D6B70` with a 2px top margin. No other
  treatment — no icons, borders, or charts.
- **`EventCard`** — white card, 4px left accent border, mono ID + status pill,
  600-weight title, slate meta line. `status: 'needs-review' | 'completed' | 'draft'`
  → orange / teal / `#8A9499`.
- **`StatusPill`** — 10px 700-weight uppercase text on a tint of its own colour.
- **`ListCard`** — white rounded card containing rows split by `#EFEDE7`; row = label
  left, value or `›` right.
- **`PrimaryButton`** (orange, white Archivo 700) / **`SecondaryButton`** (1.5px
  `#C7C3B9` border, slate text) / **`DangerGhostButton`** (1.5px `#E5D2C2` border,
  orange text — used for Sign out).
- **`Field`** — 11px 700-weight slate label above a bordered input box. Navy variant for
  Login.
- **`PersonTile`** — square-ish white tile: initials circle (`#E7EEF0` bg, teal text)
  above a name. Used in a 3-across row.
- **`OfflineNote`** — teal dot + 11px slate line ("Saved on device…").
- **`TabBar`** — 4 tabs (Dashboard, Events, Insights, Account): 22px rounded-square
  icon + 9.5px 600-weight label. Active = orange icon and label.

---

## 3. Screens

### 1 · Login
Full navy. Faded ID watermark top-right. Wordmark (38px) + eyebrow. Email and Password
fields on `#22333F`. Orange **Sign in**. An "or" divider (hairline + mono "OR"), then
two white SSO buttons: **Continue with Google** (blue "G", `#4285F4`, Archivo 800) and
**Continue with Apple** (the official Apple logo SVG, 14×17, `#17262D` — Apple's brand
guidelines require the real mark; do not substitute an emoji or Unicode symbol). Footer note on `#22333F`: signed-in sessions work offline for 30 days.

### 2 · Dashboard  *(tab 1)*
Brand header (wordmark 34px, eyebrow below, watermark). Body: two stat tiles —
**48 Completed events** (teal) and **7 Events needing review** (orange); "Recent events"
heading; two `EventCard`s (EVT-2041 needs review, EVT-2038 completed); orange
**Log new event** CTA pinned to the bottom of the body.

### 3 · Events  *(tab 2)*
Navy header: title "Events" + search field. Filter pills sit in the **body** (not the
header) as its first row, on paper, padding `14px 16px 12px`: All 55 (navy, selected),
Review 7 (orange), Done 48 (teal). Cards grouped under mono date headings ("Today",
"Earlier this week"). Includes a **draft/offline** card (grey accent, "DRAFT · OFFLINE",
"Waiting to sync").

### 4 · Log new event
Titled header. Single scrolling form: **Date** + **Time** side by side; **Site**
(select, `▾`); **Event name**; **Description** (multiline); **Interviewees** — a
3-across row of `PersonTile`s (two people + a dashed "Add" tile); **Photos** — three
54px slots (two filled, one dashed `+`). Footer: offline note + orange
**Save & start interview**.

### 5 · Select interviewee
Titled header "Who are you interviewing?" + mono event ref. A selectable list of the
event's interviewees: selected row has a 1.5px orange border and an orange check;
unselected has an empty ring; an already-interviewed person is dimmed with a teal
**DONE 12:04** pill instead of a control. Dashed **Add someone else** row. Then
**Question set** card: "Near-miss · standard / 8 questions" with `›`, followed by a
preview of questions 01 and 02 and a "6 more questions" row (**informational text, not
its own control** — the whole Question set card is the tap target, hence the `›`). Footer: consent note
("Consent is captured before recording starts") + orange CTA naming the person —
**Start interview with K. Rao**.

### 6 · Recorded interview
Dark (`#17262D`), no tab bar — a focus mode. Top row: mono "EVT-2041 · Interview 1 of 3"
and an orange **REC 04:12** with a dot. 8 progress ticks (3 orange = answered).
"Question 3 of 8" eyebrow, then the question in Archivo 700 25px. A **Live transcript**
card on `#1F323B`. An orange waveform above the controls — **static**, 13 bars of varying height, the last
3 in `#33474F` to read as unfilled. Do not animate it. Controls: "Back" (slate),
a 66px ring holding a 24px orange rounded square (stop), "Next" (orange).

### 7 · Approve transcript
Titled header + mono "EVT-2041 · INTERVIEW 1 · 12:04". Teal info bar: tap a line to
correct it; approving unlocks AI analysis. Then speaker cards — label
(**Investigator** teal / **K. Rao · witness** ink) + mono timestamp + the line. One
phrase is highlighted with an orange tint to show a flagged correction. The list is a
**scrolling region**; it ends with a centred "14 more lines" affordance. Footer:
**Edit** (secondary) + **Approve** (orange, wider).

### 8 · Insights  *(tab 3)*
Navy header: "Insights" + "AI analysis for each completed event". Cards: mono event ID,
teal **AI INSIGHT** badge, Archivo 700 finding title, 2-line summary, chips
(orange **3 ACTIONS** / **REPEAT CAUSE**, plus a neutral site/line chip). Last card is
a dimmed **ANALYSING** state: "Transcript approved — insight ready in a few minutes."

### 9 · Insight detail  *(modal sheet)*
A bottom sheet over a `#0F1E24` scrim: grab handle, mono event ref + AI badge, Archivo
800 title. Sections with teal mono eyebrows: **Key finding** (paragraph),
**Contributing factors** (orange bullet dots), **Recommended actions** (white rows).
Footer: **Close** (secondary) + **Share PDF** (orange, wider).

### 10 · Account  *(tab 4)*
Navy header with watermark: 52px initials avatar (`JM`), name, "Supervisor ·
Investigator". Body: mono eyebrow "Account information" over a `ListCard` with Name /
Email / Role. Then a `ListCard` with **Help & support** (`›`) and **Investigations
Differently** + `investigationsdifferently.com.au` (`↗`, opens the website). Then
**Sign out** (ghost, orange). Version line "EventInsight v1.0" pinned at the bottom.

### 11 · Help & support
Titled header. "Common questions" eyebrow; the first Q&A is expanded (question +
answer + `–`), three more are collapsed rows with `+`. A navy contact card: "Still need
a hand?" + support email + `↗`. Pinned at the bottom: a `ListCard` with **Terms of use**
and **Privacy policy**. All copy is template copy pending client wording.

### 12 · Terms of use
Titled header + mono "TEMPLATE · LAST UPDATED JUL 2026". Four numbered sections, each an
Archivo 700 14px heading over slate 12.5px body: **1 · Using EventInsight**,
**2 · Recordings & consent**, **3 · AI-generated insight**, **4 · Data & retention**.

### 13 · Privacy policy
Identical layout to screen 12 — build them as one screen component taking a title and a
list of sections. Its four sections are: **1 · What we collect**, **2 · How recordings
are used**, **3 · Who can access it**, **4 · Storage, retention & your rights**.

> **Both legal screens use placeholder body copy.** Client legal wording is still to be
> supplied — keep the copy in a separate constants file so it can be swapped without
> touching the screens.

---

## 4. Flow

```
Login ──▶ Dashboard ──┬─▶ Events ──▶ (event) ─┐
                      │                       │
                      └─▶ Log new event ──▶ Select interviewee ──▶ Recorded interview
                                                                        │
                                            Approve transcript ◀────────┘
                                                     │
                                    (AI analysis) ──▶ Insights ──▶ Insight detail ──▶ Share PDF

Account ──┬─▶ Help & support ──┬─▶ Terms of use
          │                    └─▶ Privacy policy
          ├─▶ investigationsdifferently.com.au (external)
          └─▶ Sign out
```

Offline behaviour surfaces in three places: the Login footer note, the "Saved on device"
note on Log new event, and the **DRAFT · OFFLINE** / "Waiting to sync" card on Events.

---

## 5. Assets

- `assets/id-mark.png` — the Investigations Differently "ID" monogram recoloured to
  faded slate `rgb(141,161,173)`, transparent, 246×246. Used as the watermark on navy
  headers at `opacity: 0.1`.
- `assets/id-mark-color.png` — the same monogram in full colour on transparent,
  246×246. For light surfaces: white circular chips, light lockups, app icons.
- Both are cropped from the client's `logo-large-light-980x246.png`. **Ask the client
  for the original vector/SVG** for a pixel-exact, infinitely scalable mark.

## 6. Files

- `PROMPT.md` — paste into Claude Code to start.
- `screens-reference.html` — all 13 screens, exact, no dependencies. Source of truth.
- `SPEC.md` — this file.
- `assets/` — logo PNGs.
