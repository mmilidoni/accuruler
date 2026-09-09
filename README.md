# AccuRuler

A Chrome/Edge/Firefox (Manifest V3) extension that recreates and improves on
[Page Ruler](https://chromewebstore.google.com/detail/page-ruler/jcbmcnpepaddcedmjdcmhbekjhbfnlff):
click-drag to draw a rectangular ruler overlay with live width, height, start
and end labels — readable on any background (auto-contrast chrome, smart label
placement, configurable colors, no popups/ads).

Current status: **P3 — Release & store prep** (see `PLAN.md`). Auto-contrast chrome
(border, crosshair and labels flip black/white to stay visible on any
background), smart label placement (labels sit outside the measured box and
flip sides when there's no room), configurable colors + units via an options
page, arrow-key nudging (1px, Shift = 10px), and verified reliability (dark /
scrolled / zoomed pages, `<dialog>`, repeat-measure, teardown/re-inject).

## Stack

Vanilla TypeScript + [Vite](https://vite.dev). One codebase for Chrome, Edge
and Firefox via [`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill)
(`browser.*` everywhere) and MV3. The action has **no popup**, so clicking it
fires `action.onClicked` (toggle); settings UI ships later via the popup on a
separate surface.

Permissions are minimal: `activeTab`, `scripting`, `storage` — no host
permissions, no data collection.

## Dev

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # cleans dist/, emits background.js + content.js + options + manifest + icons
npm run check       # typecheck + build
npm run smoke       # automated P0 check: loads dist/ into Chromium and verifies the
                    # extension registers cleanly, the service worker boots, and
                    # badge/action/scripting APIs respond
npm run build:test  # builds dist-test/ (same bundles + host_permissions: <all_urls>)
npm run test:measure# P1 check: drag-measures a known element and compares the result
                    # with its getBoundingClientRect; asserts labels + Esc behavior
npm run test:p2     # P2 check: dark/light auto-contrast, smart labels, nudging,
                    # teardown+re-inject, <dialog>, scrolled page, zoom+units,
                    # custom colors, options page save
npm run lint:amo    # AMO pre-flight lint (web-ext) against dist/
npm run package     # build + zip dist/ -> release/accuruler-<version>.zip (CWS + AMO)
npm run screenshots # regenerate store-assets/*.png (1280x800 listing screenshots)
npm run release     # check + lint:amo + package
npm run icons       # regenerate public/icons/*.png (Windows, System.Drawing)
```

Automated tests use the Playwright Chromium build
(`%LOCALAPPDATA%\ms-playwright\chromium-1223`) in headless mode; pass a Chrome
binary explicitly via `node scripts/test:p2 <path-to-chrome>`. Branded Google
Chrome ignores `--load-extension` (Chrome 137+), so automation needs Chromium
or Chrome for Testing; real Chrome works for manual "Load unpacked" testing.
`dist-test/` is a test-only artifact (extra host permission) and is gitignored.

## Settings

Click **Extension options** on the AccuRuler card in `chrome://extensions` (the
action button itself toggles the ruler, so settings live on a separate
surface):

- **Auto-contrast** (default on): border, custom crosshair and labels flip
  black/white based on the background luminance under the pointer/ruler.
- **Custom colors** (enabled when auto-contrast is off): line/crosshair color,
  fill color + opacity, label background.
- **Units**: CSS pixels, physical pixels (× devicePixelRatio), **millimetres** or
  **centimetres** (standard 96 px = 25.4 mm reference; screen-accurate but not
  calibrated to your monitor's true DPI).

Settings persist via `browser.storage.sync` and apply live to an already-drawn
ruler.

## Load unpacked

Build once (`npm run build`), then:

- **Chrome/Edge:** `chrome://extensions` (Edge: `edge://extensions`) → enable
  *Developer mode* → *Load unpacked* → select `dist/`.
- **Firefox:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on*
  → select `dist/manifest.json` (temporary; permanent install needs an
  AMO-signed package).

## Manual P0 verification

1. Open any normal web page.
2. Click the AccuRuler toolbar icon → badge shows **On** (extension disabled
   pages like `chrome://` keep the badge off — expected).
3. Click again → badge clears.
4. Click On, then reload the page → badge clears (state does not stick).
5. Click On on tab A and tab B → each toggles independently.

## Manual P1 verification (measuring)

1. Toggle the ruler on; the cursor becomes a crosshair and the page is locked
   (not clickable/scrollable — intentional, same as the original tool, and it
   keeps measurements stable).
2. Click-drag across any element → a red outline with `W × H`, `start (x, y)`
   and `end (x, y)` labels appears and updates live while dragging.
3. Compare the size with DevTools (right-click → Inspect → box model): the
   ruler should match the element's width/height in CSS pixels.
4. `Esc` during a drag cancels it; `Esc` with a finished ruler clears it.
5. Touch: drag with a finger (touch emulation in DevTools) works too.
6. Toggle off → badge clears and the overlay (and its DOM host) is removed
   completely.

## Manual P2 verification

1. **Dark page**: toggle on a dark site (e.g. a dark-mode GitHub repo page) →
   the crosshair, ruler outline and labels render white; on a light page they
   render black. No more invisible cursor/labels on dark backgrounds.
2. **Smart labels**: measure a small element mid-page → all three labels sit
   *outside* the box; measure an element flush with the viewport top → the
   `W × H` label flips below; near the bottom-right corner → the end label
   flips to the left/inside. Labels never cover the measured element when
   there's room.
3. **Arrow keys**: after drawing, `← ↑ → ↓` nudge the ruler 1px; hold `Shift`
   for 10px.
4. **Options**: `chrome://extensions` → AccuRuler → *Extension options* → turn
   off auto-contrast, pick a line/fill/label color, save → an already-drawn
   ruler restyles immediately (live). Switch units to *Millimetres* /
   *Centimetres* → labels convert (e.g. a 300×150 px box → `79.4 × 39.7 mm`).
5. **Dialog**: open a page with a `<dialog>`/popover — measuring the content
   outside it works; note the ruler overlay renders below the dialog (browser
   top layer is un-overlayable by design — documented limitation).
6. **Repeat measure**: measure → toggle off → toggle on → measure again; the
   page never ends up with two overlays or a stuck state.

Icon regeneration requires Windows; icons are committed, so this is optional.

## Layout

```
├─ public/                 # copied verbatim into dist/
│  ├─ manifest.json        # MV3: activeTab, scripting, storage; options_ui
│  ├─ options.html         # settings page shell (loads options.js)
│  └─ icons/               # 16/32/48/128
├─ scripts/
│  ├─ build.mjs            # production build -> dist/
│  ├─ build-test.mjs       # test build -> dist-test/ (+ host_permissions)
│  ├─ smoke-test.mjs       # P0 automated load/boot/API smoke test (CDP)
│  ├─ measure-test.mjs     # P1 automated drag + box-model comparison (CDP)
│  ├─ p2-test.mjs          # P2 automated complaint-fix matrix (CDP)
│  ├─ generate-icons.ps1   # icon generator (Windows)
│  └─ lib/
│     ├─ vite-build.mjs    # shared multi-entry Vite build
│     └─ cdp.mjs           # shared CDP/Chromium test helpers
└─ src/
   ├─ background.ts        # toggle, scripting injection, badge, teardown msg
   ├─ options.ts/.html/.css# settings page (auto-contrast, colors, units)
   ├─ content/
   │  ├─ index.ts          # lifecycle: drag, rAF draw, nudging, Esc, teardown
   │  ├─ overlay.ts        # closed shadow-DOM shield + smart labels + crosshair
   │  ├─ measure.ts        # pure geometry + label formatting
   │  └─ contrast.ts       # luminance sampling + auto-contrast themes
   └─ shared/
      ├─ messages.ts       # background <-> content message contract
      └─ storage.ts        # settings model + storage.sync helpers
```
