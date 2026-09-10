# AGENTS.md

AccuRuler — MV3 cross-browser (Chrome/Edge/Firefox) ruler extension. Vanilla TypeScript + Vite + `webextension-polyfill`. Full dev commands, manual-verification steps, and layout are in `README.md` — read it first; this file only records what an agent would otherwise get wrong.

## Build system (non-obvious)

- There is **no `vite.config.ts`**. Builds run through `scripts/lib/vite-build.mjs` (`buildExtension()`), which drives Vite programmatically.
- Three entry points — `background`, `content`, `options` — are each built as a **separate standalone IIFE bundle** (classic MV3 scripts, *not* ES modules). Shared modules (`src/shared/*`) are inlined per entry so the content script never emits `import`.
- Output filenames are fixed and referenced from `public/manifest.json`: `src/background.ts`→`background.js`, `src/content/index.ts`→`content.js`, `src/options.ts`→`options.js`. Renaming a source file breaks the manifest, not just the build.
- The **first** build pass wipes `outDir` and copies `public/` verbatim; later passes must not wipe. `manifest.json` is a static file in `public/`, copied as-is (version, `browser_specific_settings.gecko.id`, and the polyfill-only `background.scripts` array live there).

## Conventions that differ from defaults

- Use `browser.*` (from `webextension-polyfill`) everywhere — never `chrome.*`. The polyfill normalizes `action` vs `browserAction` and promise/callback across Chrome/Edge/Firefox.
- The action has **no popup**: clicking it fires `action.onClicked` to toggle the ruler. Settings live in the `options_ui` page (`public/options.html` + `src/options.ts`), not a popup.
- Settings persist via `browser.storage.sync` under key `"settings"`, normalized on load (`src/shared/storage.ts`). Units enum is `css | physical | mm | cm` (`src/shared/units.ts`); mm/cm assume 96 px = 25.4 mm.
- Version bumps: `package.mjs` reads the version from `dist/manifest.json`, so the **source of truth is `public/manifest.json`**, not `package.json` (keep both in sync).

## Verification

- `npm run check` = typecheck + build — run this before claiming done.
- `tsconfig.json` `include` is `["src"]` only; `scripts/*.mjs` are not typechecked.
- Tests are CDP-driven (raw WebSocket via `scripts/lib/cdp.mjs`), not the Playwright test runner:
  - `npm run smoke` needs only `dist/`.
  - `npm run test:measure` and `npm run test:p2` need `npm run build:test` first (they load `dist-test/`, which adds `host_permissions: ["<all_urls>"]`).
  - Chromium path is hardcoded to `C:\Users\mmilidoni\AppData\Local\ms-playwright\chromium-1223\...` in `cdp.mjs`; pass another binary via `node scripts/<test>.mjs <path-to-chrome>`.
  - Branded Google Chrome (137+) ignores `--load-extension`, so automation needs Playwright Chromium or Chrome for Testing.
- `npm run icons` and `npm run screenshots` are **Windows-only** (System.Drawing); icons/screenshots are committed, so regenerating is optional.

## Structure notes

- `docs/` is the GitHub Pages site (homepage + privacy), independent of the extension code — don't wire it into the build.
- Content script builds a closed shadow-DOM overlay host marked `[data-accu-ruler]`; `measure-test.mjs`/`p2-test.mjs` locate it by that selector. Don't rename the marker without updating the tests.
- Background owns per-tab active state in memory (`activeTabs` Set); it clears state on `tabs.onUpdated` (status `loading`) and `tabs.onRemoved`. Injection is intentionally idempotent.
