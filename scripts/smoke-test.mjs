// P0 smoke test: loads dist/ into Chromium and verifies
//  1. the extension registers without manifest/load errors,
//  2. the MV3 service worker boots and exposes the API surface the background
//     relies on (action badge, tabs messaging, scripting injection),
//  3. a badge set/read round-trip succeeds.
//
// Usage: node scripts/smoke-test.mjs [path-to-chrome]
import {
  Cdp,
  findExtensionId,
  launchChromium,
  PLAYWRIGHT_CHROMIUM,
  wakeServiceWorker,
} from "./lib/cdp.mjs";
import { join } from "node:path";

const CHROME = process.argv[2] ?? PLAYWRIGHT_CHROMIUM;
const DIST = join(process.cwd(), "dist");
const PORT = 9333;

const { base, shutdown } = launchChromium({
  chromePath: CHROME,
  dist: DIST,
  port: PORT,
});

async function main() {
  const ours = await findExtensionId(base, "AccuRuler");
  console.log(
    `extension loaded: ${ours.name} ${ours.version} (${ours.location}, id=${ours.id})`,
  );

  const { sw } = await wakeServiceWorker(base, ours.id);
  const probe = await sw.evaluate(
    `(async () => {
      try {
        const m = chrome.runtime.getManifest();
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return JSON.stringify({ ok: false, error: "no active tab" });
        await chrome.action.setBadgeText({ tabId: tab.id, text: "On" });
        const badge = await chrome.action.getBadgeText({ tabId: tab.id });
        await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
        return JSON.stringify({
          ok: true,
          name: m.name,
          manifestVersion: m.manifest_version,
          hasAction: typeof chrome.action === "object",
          badgeRoundTrip: badge === "On",
          onClicked: typeof chrome.action?.onClicked?.addListener === "function",
          hasScripting: typeof chrome.scripting === "object",
          sendMessage: typeof chrome.tabs.sendMessage === "function",
        });
      } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
      }
    })()`,
  );
  console.log("service worker probe:", probe);
  sw.close();

  const result = JSON.parse(probe);
  const checks = [
    result.ok,
    result.name === "AccuRuler",
    result.manifestVersion === 3,
    result.hasAction,
    result.badgeRoundTrip,
    result.onClicked,
    result.hasScripting,
    result.sendMessage,
  ];
  if (!checks.every(Boolean)) {
    throw new Error(`smoke checks failed: ${probe}`);
  }
  console.log("P0 smoke test PASSED");
}

main()
  .catch((error) => {
    console.error("P0 smoke test FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(shutdown);