# AccuRuler — Store listing

Copy for Chrome Web Store, Edge Add-ons, and Firefox AMO.

## Tagline (AMO "Summary" field, ≤70 chars)

Measure any element, on any background.

## Short summary (CWS, ≤132 chars)

Measure any element, on any background. Click-drag a ruler with live width,
height and coordinates, always visible on dark pages.

## Long description

AccuRuler recreates and improves on the classic page ruler. Click the toolbar
button, then click-drag anywhere to draw a measuring box with live width,
height, start and end labels.

What makes it different:

- Auto-contrast chrome — the border, crosshair and labels flip black or white
  to match the background under your pointer, so the ruler never disappears on
  a dark site.
- Smart label placement — labels sit outside the box you're measuring and flip
  sides when there's no room, so they never cover the element you care about.
- No popups, no ads — a single-purpose tool that gets out of your way.

Tune it to your workflow:

- Colors: line/crosshair color, fill color and opacity, label background.
- Units: CSS pixels, physical pixels (× devicePixelRatio), millimetres or
  centimetres.
- Keyboard: Esc cancels or clears; arrow keys nudge 1px (Shift = 10px).

Private by design: AccuRuler collects nothing and makes no network requests.
Settings stay in your browser.

## Category & tags

- Category: Developer Tools
- Tags: ruler, measure, pixels, screen, dimensions, web design, developer

## URLs

- Privacy policy: https://mmilidoni.github.io/accuruler/PRIVACY.md
- Homepage: https://mmilidoni.github.io/accuruler/
- Source: https://github.com/mmilidoni/accuruler

## Store-specific notes

- Chrome Web Store: use the 132-char summary above; detailed description is
  plain text (no markdown); disclose "No data collected"; single-purpose.
- Firefox AMO: "Summary" field takes the tagline; the long description
  accepts markdown; add Notes for Reviewers disclosing webextension-polyfill
  v0.12.0 (source link) + the repo (bundled-code disclosure).
- Edge Add-ons: same zip; can import from Chrome.

## GitHub Pages setup (for the URLs above)

Enable Pages on the `mmilidoni/accuruler` repo: Settings → Pages → deploy
from `main` branch root. GitHub then serves `README.md` at the homepage URL
and `PRIVACY.md` at the privacy URL — no extra files needed.