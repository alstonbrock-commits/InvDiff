# Handoff: Event Insight — Brand & App Theme

## Overview
Brand system and mobile theme for **Event Insight**, an event/incident investigation
app by **Investigations Differently**. Covers the logo lockups, color palette,
typography, and a sample mobile dashboard screen applying the theme.

## About the Design Files
The file in this bundle (`Event Insight Brand.dc.html`) is a **design reference
created in HTML** — a prototype showing the intended look, not production code to
copy directly. Recreate it in your codebase's existing environment (React, Vue,
SwiftUI, etc.) using its established patterns. The `assets/` PNGs are real,
production-ready image files you can ship as-is.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and radii below are final —
implement pixel-perfectly.

## Design Tokens

### Colors
| Token           | Hex       | Use                                             |
|-----------------|-----------|-------------------------------------------------|
| Signal Orange   | `#E4772A` | Primary accent — "Event", CTAs, high-priority   |
| Ink Navy        | `#1B2B3A` | Headers, dark surfaces, primary text (`#17262D`)|
| Insight Teal    | `#2CA5C0` | Secondary — links, data, "Insight", review tags |
| Paper           | `#F6F5F1` | App / screen background                         |
| Surface White   | `#FFFFFF` | Cards                                           |
| Slate           | `#5D6B70` | Secondary text                                  |
| Muted           | `#8A9499` | Tertiary text, mono labels                      |
| Border          | `#E5E3DC` | Card borders, dividers                          |
| Header eyebrow  | `#7FC4D6` | Teal-tint mono kicker on navy                   |

Tag/pill backgrounds use the accent at low alpha: orange `rgba(228,119,42,0.12–0.16)`,
teal `rgba(44,165,192,0.14)`.

### Typography
- **Display / wordmark / numbers:** Archivo — weights 700 / 800. Tight tracking
  (`letter-spacing: -0.02em` to `-0.03em`) on large sizes.
- **Body / UI:** Public Sans — 400 / 500 / 600 / 700.
- **Mono labels / eyebrows / IDs:** IBM Plex Mono — 400 / 500, uppercase, wide
  tracking (`0.28em`–`0.315em`).
- Google Fonts import:
  `https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap`

### Radii & Shadows
- Cards / tiles: `border-radius: 12–16px`
- Phone frame: outer `44px`, screen `34px`
- App icon tiles: `24px` (large), `16px` (small)
- Card / phone shadow: `0 24px 60px rgba(23,38,45,0.22)`

## Logo
- **Wordmark:** "Event" in Signal Orange + "Insight" in Ink Navy (or white on dark),
  set in Archivo 800, no space between words, `letter-spacing: -0.02em`.
- **Mark:** the Investigations Differently "ID" monogram (concentric rings + teal
  ID). Provided as transparent PNGs in `assets/`.
- **Faded watermark treatment:** the mark recolored to slate-blue `rgb(141,161,173)`,
  low opacity, bled into a top-right corner behind headers.

## Screens / Views

### Sample App Screen — Mobile Dashboard
- **Purpose:** Home dashboard; overview of open investigations and recent events.
- **Frame:** 360px-wide device, screen area **336 × 720** (≈19.5:9), flex column:
  fixed header → flex-1 body → fixed tab bar.
- **Header (navy `#1B2B3A`, mirrors brand hero):**
  - Status bar row (height 44): "9:41" mono left; battery glyph + profile dot right.
  - Eyebrow: "BY INVESTIGATIONS DIFFERENTLY", IBM Plex Mono, uppercase, teal `#7FC4D6`,
    single line sized to ~match wordmark width.
  - Wordmark "EventInsight", Archivo 800, 30px.
  - Stat: "Open investigations" label + "12" (Archivo 800, 38px, white) + "3 urgent"
    orange pill.
  - Faded slate ID watermark bled into top-right corner (~74px, low opacity).
- **Body (Paper bg):**
  - Two stat tiles side by side: "87%" (navy) Closed on time / "4.2d" (teal) Avg. resolution.
  - "Recent events" section heading (Archivo 700, 14px).
  - Event cards: white, 1px border, radius 12, **4px left accent border** (orange =
    high, teal = review). Each has a mono ID (e.g. EVT-2041), a priority pill, a
    600-weight title, and a slate meta line.
  - Primary CTA "Log new event": full-width orange button, radius 12, white Archivo 700,
    pinned to bottom of body (`margin-top:auto`).
- **Tab bar:** white, top border, 4 rounded-square icons; active one is orange.

## Assets
- `assets/id-mark-color.png` — ID monogram, full color (teal on transparent), 246×246.
  Use on light chips / headers.
- `assets/id-mark.png` — ID monogram recolored to faded slate `rgb(141,161,173)`,
  transparent, 246×246. Use as the corner watermark on dark surfaces.
- Source: cropped from the client-supplied `logo-large-light-980x246.png`. For a
  pixel-exact, infinitely scalable mark, request the original **vector/SVG** from the
  Investigations Differently brand owner and swap it in.

## Files
- `Event Insight Brand.dc.html` — the full HTML design reference (brand board + sample
  screen). Open in a browser to view; treat as a visual spec, not shippable source.
