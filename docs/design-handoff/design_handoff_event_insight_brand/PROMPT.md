# Paste this into Claude Code

> Copy everything below the line into Claude Code as your first message, with this
> folder open in the workspace. Stack is already filled in — nothing to edit.

---

I'm implementing a mobile app called **Event Insight** (by Investigations Differently).
This folder is a design handoff. Read these files before writing any code:

1. `screens-reference.html` — **the visual source of truth.** Plain HTML + CSS, no
   framework, no templating. Open it in a browser. It contains all 13 screens at their
   true size (336×720). Every colour, font, size, radius and spacing value in it is
   final. When my instructions and this file disagree, the file wins.
2. `SPEC.md` — design tokens, component inventory, and a screen-by-screen breakdown
   with the exact behaviour and states.
3. `assets/id-mark.png`, `assets/id-mark-color.png` — the real logo files. Ship them
   as-is. Do not recolour, filter, crop, or redraw them, and do not substitute an icon.

**My stack: React Native + TypeScript, Expo (managed workflow), NativeWind for styling.**
Target: iOS and Android phones.

The reference is HTML, so treat it as a picture of the design, not as code to port.
Translate it into idiomatic React Native — never inline raw HTML/CSS.

## What I want you to do

1. Read `SPEC.md` in full, then open `screens-reference.html` in a browser and read its
   markup for the screens you're about to build.
2. Set up the theme first: put every token from **SPEC.md §1** into
   `tailwind.config.js` under `theme.extend` (colours, fontFamily, plus the off-scale
   fontSize/spacing/borderRadius values noted below). Screens should then use classes
   like `bg-ink-navy` / `text-orange`, not arbitrary values.
3. Load the three fonts as bundled assets with `expo-font` (`useFonts`): **Archivo**
   (700, 800), **Public Sans** (400, 500, 600, 700), **IBM Plex Mono** (400, 500).
   Hold the splash screen until they're loaded — the design breaks visibly on fallback
   fonts. Do not use a Google Fonts `<link>`; that's web-only.
4. Build the shared components in **SPEC.md §2** before any screen, so screens are
   composition only. Anything not on that list is screen-local — inline it (specifically:
   the interview waveform and the question-set card are single-use, do not abstract them).
5. Then build the screens in the order at the bottom of this message, one at a time.
   After each screen, stop and show me a diff summary so I can eyeball it before you
   continue.
6. Navigation: use Expo Router (or React Navigation if you prefer — tell me which and
   why before you commit). Bottom tabs = Dashboard / Events / Insights / Account.
   Screen 9 (Insight detail) is a modal bottom sheet, not a pushed route. Screen 6
   (Recorded interview) hides the tab bar — it's a focus mode.
7. Data: hardcoded TypeScript fixtures matching the copy in the reference exactly. No
   backend, no state library, no invented fields.

## React Native specifics — get these right, they're the usual sources of drift

- **Every string needs a `<Text>`.** There's no text inheritance, so font family, size,
  weight and colour must be set explicitly on each text node (a `<Text>` component per
  role — title/body/mono — is the tidy way).
- **`letterSpacing` is in points, not em.** Convert: the wordmark is -0.02em, so ≈ -0.7
  at 34px, ≈ -0.6 at 30px. Mono eyebrows are 0.18em–0.315em → ≈ +1.5 to +3 at 8.5–10px.
  Don't drop the tracking; it's load-bearing in this design.
- **Border shorthand doesn't exist.** The event-card accent is
  `borderLeftWidth: 4` + `borderLeftColor`, not `border-left`.
- **Dashed borders render unreliably on Android** (the "Add someone else" row, the photo
  `+` slot). Use `react-native-svg` for those, or a solid `#C7C3B9` border as a
  documented fallback — tell me which you chose.
- **The Apple logo needs `react-native-svg`.** The path is in `screens-reference.html`
  on screen 1. Use the real mark — Apple's brand guidelines require it; never an emoji.
- **Off-scale values must go in the theme, not be rounded** to the nearest Tailwind
  step. The design uses 8.5/9/9.5/11/11.5/12.5/13.5px type, 13px padding, and 34px
  screen radius. Rounding these is the fastest way to make it look wrong.
- **The watermark** (`assets/id-mark.png`, opacity 0.1, bleeding off the header's
  top-right) needs `overflow: 'hidden'` on the header and `position: 'absolute'` on the
  image. Verify it clips on Android, not just iOS.
- **Scrolling regions are explicit.** Where the reference clips content at the frame
  edge — the transcript on screen 7, the forms on 4 and 5 — that's a `ScrollView`.
  Header and tab bar stay fixed; only the middle scrolls.
- **The 336×720 frames are the mock size, not a layout constraint.** Screens fill the
  viewport. Keep all fixed values (padding, radii, type sizes) exactly, and use
  `SafeAreaView`/`useSafeAreaInsets` for the real status bar and home indicator — the
  reference's fake 44px status bar row is drawn for the mock; replace it with the real
  inset. Don't render "9:41".

## Rules

- **Match the reference pixel-for-pixel** in colour, type, spacing and radii. Do not
  "improve" the design, reorder anything, add shadows/gradients/animations, or swap
  fonts.
- The wordmark is one word: "Event" in `#E4772A` + "Insight" in white on navy, or
  `#17262D` on light. Archivo 800. Never restyle it.
- Ask me before adding any screen, field, or copy that isn't in the reference.
- Don't add analytics, a state library, or backend calls unless I ask.

## Order of work

Theme + fonts → components → 1 Login → 2 Dashboard → 3 Events → 4 Log new event →
5 Select interviewee → 6 Recorded interview → 7 Approve transcript → 8 Insights →
9 Insight detail → 10 Account → 11 Help & support → 12 Terms of use → 13 Privacy policy

Start with step 1: read the files, then tell me the token list, the component list, and
your navigation choice, plus anything ambiguous — before writing code.
