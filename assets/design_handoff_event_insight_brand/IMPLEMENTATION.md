# IMPLEMENTATION GUIDE — read this first (for Claude Code)

You are implementing the **Event Insight mobile dashboard** in this codebase.

## Which file to use
- ✅ **`mobile-screen-reference.html`** — THE source of truth. Plain HTML + CSS,
  no framework, no templating. Open it in a browser; recreate it 1:1 in this
  codebase's UI framework. Every color, size, and font is resolved and final.
- ✅ **`assets/id-mark.png`**, **`assets/id-mark-color.png`** — ship these as-is.
- ⚠️ **`Event Insight Brand.dc.html`** — visual reference only. It uses a custom
  runtime and `{{ placeholder }}` template holes (`{{ accent }}` = `#E4772A`,
  `{{ inkBg }}` = `#1B2B3A`). Do NOT parse or port this file; ignore it unless
  you need to see the wider brand board.

## What to build
One mobile screen, structured as three stacked regions in a flex column
(screen = 336×720 in the mock; in a real app: full viewport, same proportions):

1. **Header** — fixed height by content, navy `#1B2B3A`, contains (top→bottom):
   status bar, eyebrow line, wordmark, stat block. A watermark logo
   (`assets/id-mark.png`, opacity 0.1) is absolutely positioned in the top-right,
   allowed to bleed off the edge (`overflow:hidden` on header).
2. **Body** — `flex:1`, background `#F6F5F1`: two stat tiles in a row, a
   "Recent events" heading, a list of event cards, and a full-width orange CTA
   pinned to the bottom via `margin-top:auto`.
3. **Tab bar** — white, top border `#E5E3DC`, 4 tabs, active tab orange.

The exact DOM tree, class names, and every CSS value are in
`mobile-screen-reference.html` — copy from its `<style>` block. The `:root`
custom properties at the top ARE the design tokens; map them to this codebase's
token system.

## Component breakdown (suggested)
- `DashboardScreen` — layout shell (header / body / tabbar)
- `AppHeader` — status bar, eyebrow, wordmark, open-investigations stat, watermark
- `StatTile { value, unit, caption, tone: "ink" | "teal" }`
- `EventCard { id, title, meta, status: "high" | "review" }`
  - left accent border: 4px, orange for `high`, teal for `review`
  - status tag pill: colored text on 12–16% alpha tint of the same color
- `PrimaryButton` — orange `#E4772A`, radius 12, Archivo 700, white text
- `TabBar` — active tab orange

## Rules that matter
- Fonts: **Archivo** (display/numbers/buttons, 700–800), **Public Sans** (body),
  **IBM Plex Mono** (eyebrow, event IDs — uppercase, letter-spacing 0.28–0.315em).
- Wordmark is one word "EventInsight": "Event" `#E4772A`, "Insight" white (on navy)
  or `#17262D` (on light). Archivo 800, letter-spacing -0.02em.
- Never restyle the ID logo PNGs (no filters/tints); use the provided files.
- Radii: cards 12px, screen corners 34px. Card shadow only on the device frame,
  not on cards (cards use 1px `#E5E3DC` borders instead).
- Real data replaces: count 12, "3 urgent", 87%, 4.2d, and the two sample events.
