// P2 complaint-fix tests (plan §5 matrix): dark page, top-edge smart labels,
// arrow nudging, teardown + re-inject (repeat measure), <dialog> page, scrolled
// page, zoom/DPR + physical units, and custom colors from storage.sync.
//
// Uses the dist-test build (host_permissions: <all_urls>) so the content
// script can be injected without a user gesture.
// Usage: node scripts/p2-test.mjs [path-to-chrome]
import http from "node:http";
import { join } from "node:path";

import {
  findExtensionId,
  launchChromium,
  PLAYWRIGHT_CHROMIUM,
  wakeServiceWorker,
} from "./lib/cdp.mjs";

const CHROME = process.argv[2] ?? PLAYWRIGHT_CHROMIUM;
const DIST = join(process.cwd(), "dist-test");
const PORT = 9555;

const FIXTURES = {
  light: `<!doctype html><html><head><style>html,body{margin:0;background:#ffffff}</style></head>
    <body><div id="target" style="position:absolute;left:100px;top:120px;width:300px;height:150px;background:#cccccc"></div></body></html>`,
  dark: `<!doctype html><html><head><style>html,body{margin:0;background:#000000}</style></head>
    <body><div id="target" style="position:absolute;left:100px;top:120px;width:300px;height:150px;background:#222222"></div></body></html>`,
  top: `<!doctype html><html><head><style>html,body{margin:0;background:#ffffff}</style></head>
    <body><div id="target" style="position:absolute;left:10px;top:0px;width:200px;height:100px;background:#cccccc"></div></body></html>`,
  dialog: `<!doctype html><html><head><style>html,body{margin:0;background:#ffffff}</style></head>
    <body>
      <dialog open style="position:fixed;top:0;left:0;width:400px;height:300px;margin:0;border:0;background:#eee">dialog</dialog>
      <div id="target" style="position:absolute;left:500px;top:400px;width:300px;height:150px;background:#cccccc"></div>
    </body></html>`,
  scroll: `<!doctype html><html><head><style>html,body{margin:0;background:#ffffff}</style></head>
    <body>
      <div style="height:2000px"></div>
      <div id="target" style="position:absolute;left:100px;top:900px;width:300px;height:150px;background:#cccccc"></div>
    </body></html>`,
};

const server = http.createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname.slice(1);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(FIXTURES[path] ?? "not found");
});

const { base, shutdown } = launchChromium({
  chromePath: CHROME,
  dist: DIST,
  port: PORT,
  headless: true,
});

const VK = {
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Escape: 27,
};

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const pageUrl = `http://127.0.0.1:${server.address().port}`;

  const ours = await findExtensionId(base, "AccuRuler");
  const { page, sw } = await wakeServiceWorker(base, ours.id);

  async function loadFixture(path) {
    await page.call("Page.navigate", { url: `${pageUrl}/${path}` });
    await new Promise((resolve) => setTimeout(resolve, 500));
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

  const getState = (tabId) =>
    sw.evaluate(
      `chrome.tabs.sendMessage(${tabId}, { type: "accuruler:getState" }).catch((e) => ({ error: String(e) }))`,
    );

  async function drag(x1, y1, x2, y2) {
    await page.call("Input.dispatchMouseEvent", {
      type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1,
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
      type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  async function pressKey(key, shift = false) {
    const params = {
      key, code: key,
      windowsVirtualKeyCode: VK[key], nativeVirtualKeyCode: VK[key],
      modifiers: shift ? 8 : 0,
    };
    await page.call("Input.dispatchKeyEvent", { type: "keyDown", ...params });
    await page.call("Input.dispatchKeyEvent", { type: "keyUp", ...params });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const targetRect = () =>
    page.evaluate(
      `(() => { const r = document.getElementById("target").getBoundingClientRect(); return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height }); })()`,
    );

  const hostCount = () =>
    page.evaluate(`document.querySelectorAll("[data-accu-ruler]").length`);

  const setSettings = (settings) =>
    sw.evaluate(
      `chrome.storage.sync.set({ settings: ${JSON.stringify(settings)} })`,
    );

  // 1. Light page -> dark chrome (auto-contrast).
  let tabId = await loadFixture("light");
  await drag(100, 120, 400, 270);
  let s = await getState(tabId);
  assert(s.theme?.border === "#111111", `light page theme: ${JSON.stringify(s.theme)}`);
  assert(
    s.rect.x === 100 && s.rect.y === 120 && s.rect.width === 300 && s.rect.height === 150,
    `light rect: ${JSON.stringify(s.rect)}`,
  );
  console.log("1. light page -> dark chrome OK");

  // 2. Dark page -> light chrome.
  tabId = await loadFixture("dark");
  await drag(100, 120, 400, 270);
  s = await getState(tabId);
  assert(s.theme?.border === "#ffffff", `dark page theme: ${JSON.stringify(s.theme)}`);
  console.log("2. dark page -> light chrome OK");

  // 3. Smart label placement: element flush with the top edge -> size label
  //    flips below the box (never covers it).
  tabId = await loadFixture("top");
  await drag(10, 0, 210, 100);
  s = await getState(tabId);
  assert(s.placement?.size === "below", `top-edge placement: ${JSON.stringify(s.placement)}`);
  assert(
    s.labelBoxes.size.y >= s.rect.y + s.rect.height,
    `size label still covers the box: ${JSON.stringify(s.labelBoxes)}`,
  );
  console.log("3. smart label placement (top edge) OK");

  // 4. Arrow nudging: 1px, Shift = 10px.
  tabId = await loadFixture("light");
  await drag(100, 120, 400, 270);
  await pressKey("ArrowRight");
  await pressKey("ArrowRight", true);
  s = await getState(tabId);
  assert(s.rect.x === 111, `nudge x: ${s.rect.x}`);
  assert(s.rect.y === 120, `nudge y unchanged: ${s.rect.y}`);
  await pressKey("ArrowUp");
  s = await getState(tabId);
  assert(s.rect.y === 119, `nudge up: ${s.rect.y}`);
  console.log("4. arrow nudging (1px / Shift 10px) OK");

  // 5. Teardown + re-inject: repeat measure never sticks or duplicates.
  await sw.evaluate(
    `chrome.tabs.sendMessage(${tabId}, { type: "accuruler:teardown" }).catch(() => undefined)`,
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert((await hostCount()) === 0, `hosts after teardown: ${await hostCount()}`);
  const afterTeardown = await getState(tabId);
  assert(afterTeardown.error !== undefined, `GetState after teardown: ${JSON.stringify(afterTeardown)}`);
  const reinjected = JSON.parse(
    await sw.evaluate(
      `(async () => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => t.url && t.url.startsWith("http://127.0.0.1:"));
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        await new Promise((r) => setTimeout(r, 250));
        return JSON.stringify({ tabId: tab.id });
      })()`,
    ),
  );
  tabId = reinjected.tabId;
  assert((await hostCount()) === 1, `hosts after re-inject: ${await hostCount()}`);
  await drag(100, 120, 400, 270);
  s = await getState(tabId);
  assert(s.rect?.width === 300 && s.rect?.height === 150, `repeat measure: ${JSON.stringify(s.rect)}`);
  console.log("5. teardown + re-inject (repeat measure) OK");

  // 6. <dialog> page: measuring the regular content still works.
  tabId = await loadFixture("dialog");
  await drag(500, 400, 800, 550);
  s = await getState(tabId);
  const expected = JSON.parse(await targetRect());
  assert(
    s.rect &&
      Math.abs(s.rect.x - expected.x) <= 1 &&
      Math.abs(s.rect.y - expected.y) <= 1 &&
      Math.abs(s.rect.width - expected.width) <= 1 &&
      Math.abs(s.rect.height - expected.height) <= 1,
    `dialog page rect ${JSON.stringify(s.rect)} vs ${JSON.stringify(expected)}`,
  );
  console.log("6. <dialog> page OK");

  // 7. Scrolled page: measurements stay correct (clientX/Y are viewport-based).
  tabId = await loadFixture("scroll");
  await page.evaluate("window.scrollTo(0, 400)");
  await new Promise((resolve) => setTimeout(resolve, 200));
  const scrolled = JSON.parse(await targetRect());
  await drag(scrolled.x, scrolled.y, scrolled.x + scrolled.width, scrolled.y + scrolled.height);
  s = await getState(tabId);
  assert(
    s.rect &&
      Math.abs(s.rect.x - scrolled.x) <= 1 &&
      Math.abs(s.rect.y - scrolled.y) <= 1 &&
      Math.abs(s.rect.width - scrolled.width) <= 1 &&
      Math.abs(s.rect.height - scrolled.height) <= 1,
    `scrolled rect ${JSON.stringify(s.rect)} vs ${JSON.stringify(scrolled)}`,
  );
  console.log("7. scrolled page OK");

  // 8. Zoom (devicePixelRatio 2): CSS-px rect unchanged; physical units scale labels.
  tabId = await loadFixture("light");
  await page.call("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 800, deviceScaleFactor: 2, mobile: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await drag(100, 120, 400, 270);
  s = await getState(tabId);
  assert(s.dpr === 2, `dpr: ${s.dpr}`);
  assert(s.rect?.width === 300 && s.rect?.height === 150, `zoom css rect: ${JSON.stringify(s.rect)}`);
  assert(s.labels?.size === "300 × 150", `zoom css labels: ${s.labels?.size}`);
  await setSettings({
    autoContrast: false, borderColor: "#e11d48", fillColor: "#e11d48",
    fillOpacity: 0, labelBackground: "#111827", units: "physical",
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  s = await getState(tabId);
  assert(s.labels?.size === "600 × 300", `physical labels: ${s.labels?.size}`);
  await page.call("Emulation.clearDeviceMetricsOverride");
  console.log("8. zoom + physical units OK");

  // 9. Custom colors (auto-contrast off) flow from storage.sync to the ruler.
  tabId = await loadFixture("light");
  await setSettings({
    autoContrast: false, borderColor: "#00ff00", fillColor: "#0000ff",
    fillOpacity: 0.5, labelBackground: "#ff00ff", units: "css",
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  await drag(100, 120, 400, 270);
  s = await getState(tabId);
  assert(s.theme?.border === "#00ff00", `custom border: ${JSON.stringify(s.theme)}`);
  assert(s.theme?.fill === "rgba(0, 0, 255, 0.5)", `custom fill: ${s.theme?.fill}`);
  console.log("9. custom colors OK");

  // 10. Options page loads, edits and persists settings via storage.sync.
  await page.call("Page.navigate", {
    url: `chrome-extension://${ours.id}/options.html`,
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
  const formOk = await page.evaluate(
    `(() => {
      const save = document.getElementById("save");
      const auto = document.getElementById("auto-contrast");
      const border = document.getElementById("border");
      if (!save || !auto || !border) return false;
      auto.checked = false;
      auto.dispatchEvent(new Event("change"));
      border.value = "#123456";
      save.click();
      return true;
    })()`,
  );
  assert(formOk, "options page form missing");
  await new Promise((resolve) => setTimeout(resolve, 400));
  const stored = JSON.parse(
    await sw.evaluate(
      `chrome.storage.sync.get("settings").then((s) => JSON.stringify(s.settings ?? null))`,
    ),
  );
  assert(stored?.borderColor === "#123456", `options save: ${JSON.stringify(stored)}`);
  assert(stored?.autoContrast === false, `options autoContrast: ${stored?.autoContrast}`);
  console.log("10. options page load + save OK");

  // 11. Crosshair theme is set on hover before any drawing (was invisible
  //     until the first drag because --crosshair was only applied on draw).
  await setSettings({
    autoContrast: true, borderColor: "#e11d48", fillColor: "#e11d48",
    fillOpacity: 0, labelBackground: "#111827", units: "css",
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  tabId = await loadFixture("light");
  await page.call("Input.dispatchMouseEvent", {
    type: "mouseMoved", x: 200, y: 200, button: "none", buttons: 0,
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  s = await getState(tabId);
  assert(s.crosshair === "#111111", `crosshair before drag: ${JSON.stringify(s.crosshair)}`);
  console.log("11. crosshair visible before drawing OK");

  // 12. Label collision resolution: labels never overlap each other.
  const intersect = (a, b) =>
    a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
  tabId = await loadFixture("light");
  await drag(100, 120, 140, 320); // narrow: 40 x 200
  s = await getState(tabId);
  let boxes = s.labelBoxes;
  assert(!intersect(boxes.size, boxes.start), `narrow size/start overlap: ${JSON.stringify(boxes)}`);
  assert(!intersect(boxes.size, boxes.end), `narrow size/end overlap: ${JSON.stringify(boxes)}`);
  assert(!intersect(boxes.start, boxes.end), `narrow start/end overlap: ${JSON.stringify(boxes)}`);
  await drag(100, 120, 700, 160); // short + wide: 600 x 40
  s = await getState(tabId);
  boxes = s.labelBoxes;
  assert(!intersect(boxes.size, boxes.start), `wide size/start overlap: ${JSON.stringify(boxes)}`);
  assert(!intersect(boxes.size, boxes.end), `wide size/end overlap: ${JSON.stringify(boxes)}`);
  assert(!intersect(boxes.start, boxes.end), `wide start/end overlap: ${JSON.stringify(boxes)}`);
  console.log("12. label collision resolution OK");

  // 13. mm / cm units (standard 96 px = 25.4 mm assumption).
  tabId = await loadFixture("light");
  await drag(100, 120, 400, 270); // 300 x 150 at (100,120)
  await setSettings({
    autoContrast: false, borderColor: "#e11d48", fillColor: "#e11d48",
    fillOpacity: 0, labelBackground: "#111827", units: "mm",
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  s = await getState(tabId);
  assert(s.labels?.size === "79.4 × 39.7 mm", `mm size: ${s.labels?.size}`);
  assert(s.labels?.start === "start (26.5, 31.8) mm", `mm start: ${s.labels?.start}`);
  assert(s.labels?.end === "end (105.8, 71.4) mm", `mm end: ${s.labels?.end}`);
  await setSettings({
    autoContrast: false, borderColor: "#e11d48", fillColor: "#e11d48",
    fillOpacity: 0, labelBackground: "#111827", units: "cm",
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  s = await getState(tabId);
  assert(s.labels?.size === "7.94 × 3.97 cm", `cm size: ${s.labels?.size}`);
  assert(s.labels?.start === "start (2.65, 3.18) cm", `cm start: ${s.labels?.start}`);
  assert(s.labels?.end === "end (10.58, 7.14) cm", `cm end: ${s.labels?.end}`);
  console.log("13. mm/cm units OK");

  console.log("P2 complaint-fix test PASSED");
  page.close();
  sw.close();
}

main()
  .catch((error) => {
    console.error("P2 complaint-fix test FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    server.close();
    await shutdown();
  });