// Generates the store listing screenshots (store-assets/*.png, 1280x800) by
// loading dist-test/ into headless Chromium, drawing rulers on a bundled demo
// page (scripts/fixtures/demo.html) via CDP, and capturing the viewport.
// Usage: node scripts/screenshots.mjs [path-to-chrome]
import http from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

import { buildExtension } from "./lib/vite-build.mjs";
import {
  findExtensionId,
  launchChromium,
  PLAYWRIGHT_CHROMIUM,
  sleep,
  wakeServiceWorker,
} from "./lib/cdp.mjs";

const CHROME = process.argv[2] ?? PLAYWRIGHT_CHROMIUM;
const DIST = join(process.cwd(), "dist-test");
const PORT = 9666;
const OUT_DIR = "store-assets";
const FIXTURE_DIR = join(process.cwd(), "scripts", "fixtures");

const DEFAULT_SETTINGS = {
  autoContrast: true,
  borderColor: "#e11d48",
  fillColor: "#e11d48",
  fillOpacity: 0,
  labelBackground: "#111827",
  units: "css",
};
const COLORED_SETTINGS = {
  autoContrast: false,
  borderColor: "#e11d48",
  fillColor: "#e11d48",
  fillOpacity: 0.15,
  labelBackground: "#111827",
  units: "css",
};
const MM_SETTINGS = { ...COLORED_SETTINGS, units: "mm" };

// dist-test build (host_permissions: <all_urls>) so injection needs no gesture.
await buildExtension(DIST);
const manifestPath = join(DIST, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.host_permissions = ["<all_urls>"];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://x").pathname;
  const file = pathname === "/" ? "/demo.html" : pathname;
  try {
    const body = readFileSync(join(FIXTURE_DIR, file.slice(1)));
    res.setHeader(
      "content-type",
      MIME[extname(file)] ?? "application/octet-stream",
    );
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
});

const { base, shutdown } = launchChromium({
  chromePath: CHROME,
  dist: DIST,
  port: PORT,
  headless: true,
});

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const ours = await findExtensionId(base, "AccuRuler");
  const { page, sw } = await wakeServiceWorker(base, ours.id);

  // Pin the layout viewport to exactly 1280x800 (the headless window size does
  // not translate to the page viewport, and CWS requires 1280x800 or 640x400).
  await page.call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(200);

  const setSettings = (settings) =>
    sw.evaluate(
      `chrome.storage.sync.set({ settings: ${JSON.stringify(settings)} })`,
    );

  async function loadDemo(theme) {
    const query = theme ? `?theme=${theme}` : "";
    await page.call("Page.navigate", { url: `${baseUrl}/demo.html${query}` });
    await sleep(600);
    const injected = JSON.parse(
      await sw.evaluate(
        `(async () => {
          const tabs = await chrome.tabs.query({});
          const tab = tabs.find((t) => t.url && t.url.startsWith("http://127.0.0.1:"));
          if (!tab) return JSON.stringify({ ok: false, error: "fixture tab not found" });
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
          await new Promise((r) => setTimeout(r, 250));
          return JSON.stringify({ ok: true, tabId: tab.id });
        })()`,
      ),
    );
    assert(injected.ok, `injection failed: ${JSON.stringify(injected)}`);
    return injected.tabId;
  }

  async function drag(x1, y1, x2, y2) {
    await page.call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: x1,
      y: y1,
      button: "left",
      clickCount: 1,
    });
    for (let i = 1; i <= 8; i++) {
      await page.call("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: x1 + ((x2 - x1) * i) / 8,
        y: y1 + ((y2 - y1) * i) / 8,
        button: "left",
        buttons: 1,
      });
    }
    await page.call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: x2,
      y: y2,
      button: "left",
      clickCount: 1,
    });
    await sleep(300);
  }

  const rectOf = (id) =>
    page
      .evaluate(
        `(() => { const r = document.getElementById("${id}").getBoundingClientRect(); return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height }); })()`,
      )
      .then(JSON.parse);

  async function capture(name) {
    const { data } = await page.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true,
    });
    const out = join(OUT_DIR, name);
    writeFileSync(out, Buffer.from(data, "base64"));
    console.log("wrote", out);
  }

  // 1. Light page, auto-contrast (dark chrome), ruler over card-1.
  await setSettings(DEFAULT_SETTINGS);
  await loadDemo();
  let r = await rectOf("card-1");
  await drag(r.x, r.y, r.x + r.width, r.y + r.height);
  await capture("01-light-ruler.png");

  // 2. Dark page: auto-contrast flips the chrome to white.
  await loadDemo("dark");
  r = await rectOf("card-1");
  await drag(r.x, r.y, r.x + r.width, r.y + r.height);
  await capture("02-dark-contrast.png");

  // 3. Options page with custom colors visible.
  await setSettings(COLORED_SETTINGS);
  await page.call("Page.navigate", {
    url: `chrome-extension://${ours.id}/options.html`,
  });
  await sleep(900);
  await capture("03-options.png");

  // 4. Millimetre units on a colored ruler.
  await setSettings(MM_SETTINGS);
  await loadDemo();
  r = await rectOf("card-2");
  await drag(r.x, r.y, r.x + r.width, r.y + r.height);
  await capture("04-units-mm.png");

  // 5. Smart labels: small element flush with the top -> labels flip below.
  await setSettings(DEFAULT_SETTINGS);
  await loadDemo();
  r = await rectOf("badge");
  await drag(r.x, r.y, r.x + r.width, r.y + r.height);
  await capture("05-smart-labels.png");

  console.log("Screenshots complete -> store-assets/");
  page.close();
  sw.close();
}

main()
  .catch((error) => {
    console.error("screenshots FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    server.close();
    await shutdown();
  });