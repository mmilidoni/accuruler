# AccuRuler — Implementation Plan

A Chrome/Edge/Firefox extension that recreates and improves on
[Page Ruler](https://chromewebstore.google.com/detail/page-ruler/jcbmcnpepaddcedmjdcmhbekjhbfnlff).

## Context

The target extension (Page Ruler by leocompson, v0.1.8, 500k users, 3.9★/102 ratings)
measures distances in pixels by drawing a rectangular ruler overlay with live width,
height, start and end labels. Its recent rating average is 3.40 (declining), and 27%
of reviews are 1–2★.

Top 1–2★ complaints (verbatim where useful):

| # | Complaint | Theme |
|---|---|---|
| 1 | "the black cursor is impossible to see against black backgrounds… Digital Ruler automatically changes the cursor's colour to contrast" + "Can we add color options for the lines" | Visibility/contrast — #1 uninstall reason |
| 2 | "Не работает" / "Completely trash!" / stops working after one measurement | Reliability/sticky-state bugs |
| 3 | Ruler mispositions when the page is scrolled | Scroll-position bug |
| 4 | "всплывающие штуки мешают" (popups interfere) | Intrusive overlay/labels |
| 5 | "Doesn't work with new HTML features like dialog or popover. Also doesn't work with stopped debugger" | Modern HTML / dev workflow |
| 6 | Labels/tooltips obscure the very element being measured (esp. small elements) | Label occlusion |
| 7 | Doesn't work on file:// until "Allow access to file URLs" is enabled | Onboarding/discoverability |

## Decisions

- **Name:** **AccuRuler** — "accurate ruler." Product-like and trademark-friendlier than
  descriptive alternatives (True Web Ruler). No exact-name collision found in search.
- **Tagline angle:** "Measure any element, on any background" (leads with accuracy +
  the auto-contrast differentiator).
- **Stack:** Vanilla TypeScript + Vite.
- **Scope:** MVP + complaint fixes (no snapping/element-inspector in v1).
- **Browsers:** Chrome + Edge + Firefox.

> **Pre-submission check:** confirm exact-name availability on Chrome Web Store, Edge
> Add-ons, and Firefox AMO. CWS/Edge/AMO can differ even when search shows no collision.

---

## 1. Product requirements (v1)

**Parity with original**

1. Toolbar button toggles ruler on/off; per-tab state (badge shows active).
2. Click-drag draws a rectangular ruler overlay.
3. Live pixel labels: width, height, start (x,y), end (x,y).
4. Touch support via pointer events.

**Complaint fixes (the "better product" differentiators)**

5. **Auto-contrast chrome** — cursor, crosshair, border, and labels flip black/white
   based on the background luminance under the pointer (fixes the #1 uninstall reason).
6. **Smart label placement** — labels never cover the measured element; they position
   outside the box or flip sides based on available space.
7. **Configurable colors** (lines, fill, label background) — persisted.
8. **No popups/ads/overlay chrome** — minimal toolbar only.
9. **Reliability** — never "works once then breaks"; clean teardown on
   navigation/scroll; idempotent inject.
10. **Modern HTML support** — works over `<dialog>` and `popover` (max z-index,
    isolated overlay).
11. **Keyboard** — `Esc` cancel; Arrow keys nudge 1px (Shift = 10px) after drawing.

## 2. Architecture (cross-browser, MV3)

- **Permissions:** `activeTab` + `scripting` + `storage` only. No host permissions.
- **Browser API layer:** use
  [`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill) so one
  codebase targets Chrome, Edge, and Firefox (`browser.*` everywhere). Firefox supports
  MV3 `scripting`/`action`; the polyfill normalizes promise vs. callback and `action`
  naming differences.
- **Background (service worker/event page):** `browser.action.onClicked` toggles;
  injects or tears down the content script via `browser.scripting.executeScript`; tracks
  per-tab state; `browser.action.setBadgeText`.
- **Content script:** builds a full-viewport `position:fixed` overlay inside a **closed
  shadow DOM** (`all:initial`, `z-index: 2147483647`) so page CSS can't break it.
- **Rendering:** redraw on `requestAnimationFrame` from `clientX/Y` (CSS px); optional
  physical-px = CSS px × `devicePixelRatio`.
- **Contrast engine:** `document.elementFromPoint` → `getComputedStyle().backgroundColor`
  → parse RGB → relative luminance → choose dark/light chrome.
- **Settings:** popup with color pickers + unit toggle, persisted via
  `browser.storage.sync`.

## 3. File structure

```
page-ruler/
├─ manifest.json              # MV3; activeTab, scripting, storage
├─ package.json, vite.config.ts, tsconfig.json
├─ icons/                     # 16/32/48/128
└─ src/
   ├─ background.ts           # toggle, injection, badge, teardown messages
   ├─ content/
   │  ├─ index.ts             # lifecycle: inject/teardown, event binding
   │  ├─ overlay.ts           # shadow-DOM overlay construction
   │  ├─ measure.ts           # geometry, nudging, DPR handling
   │  └─ contrast.ts          # luminance-based color flipping
   ├─ popup/                  # settings UI (colors, units)
   └─ shared/                 # constants, types, storage helpers, browser-api shim
```

## 4. Phased execution (each phase independently shippable & verifiable)

| Phase | Work | Verification (done-when) |
|---|---|---|
| **P0 — Scaffold** | Vite + TS, polyfill, MV3 manifest, icons, background toggle with badge | Toggle works and badge reflects state in Chrome, Edge, Firefox |
| **P1 — Core parity** | Overlay + drag-to-draw + live W/H/start/end + Esc | Ruler measures a known `<div>` exactly, matching DevTools box model |
| **P2 — Complaint fixes** | Auto-contrast, smart labels, color settings, arrow nudging, reliable teardown | Passes on dark page, scrolled page, zoomed page, `<dialog>`, repeat-measure |
| **P3 — Polish + store prep** | Permission audit, privacy policy, screenshots, demo video, store metadata | Package loads unpacked in all 3 browsers |

## 5. Test matrix

Dark/light backgrounds · scrolled page · zoom 150% · high-DPI/Retina · `<dialog>`/
`popover` · iframe content · DevTools responsive mode · touch emulation · measure →
dismiss → re-measure reliability. Automate the happy paths with Playwright loading the
unpacked extension (Chrome + Edge); manual pass for Firefox.

## 6. Store publishing checklist

- **Chrome Web Store** + **Edge Add-ons**: same MV3 package; disclose `activeTab`/
  `scripting`/`storage` usage and "no data collection."
- **Firefox AMO**: same code via polyfill; expect a stricter manual review — the
  minimal-permission posture is the main defense.
- Listing assets: 5 screenshots (incl. a dark-page shot showing auto-contrast),
  30–60s demo video.

## 7. Risk register

| Risk | L×I | Mitigation |
|---|---|---|
| Page CSS leaks into overlay | High×High | Closed shadow DOM + `all:initial`, max z-index |
| `dialog`/top-layer renders above overlay | Med×Med | Max z-index; browser top layer is un-overlayable by design — document |
| DPR/zoom rounding errors | Med×High | Measure CSS px; physical-px optional, not default |
| `elementFromPoint` blocked by iframe/Shadow DOM | Med×Med | Top-frame-only scope, documented (no snapping in v1 anyway) |
| Firefox API/MV3 differences | Med×Med | `webextension-polyfill` + CI smoke test on all 3 browsers |
| AMO/CWS rejection | Low×Med | Minimal permissions, explicit privacy disclosure, single-purpose |
| Sticky-state ("works once") regression | Med×High | Idempotent inject/teardown, state owned by background, navigation listener cleanup |

## 8. Rollback notes

- Phases are cumulative and each is shippable; revert = drop the last phase.
- Runtime injection means teardown leaves zero DOM residue; uninstall is fully clean.
- Only later-stage change with meaningful store-review cost would be adding `<all_urls>`
  — not required for v1; gate behind a separate decision if ever needed.

## Implementation order

Start at **P0 — Scaffold**.
