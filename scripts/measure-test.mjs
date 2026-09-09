// P1 measurement test: verifies the ruler measures a known element exactly
// (matching its getBoundingClientRect / DevTools box model), labels are
// correct, and Esc clears the ruler.
//
// Uses the dist-test build (host_permissions: <all_urls>) so the content
// script can be injected without a user gesture.
// Usage: node scripts/measure-test.mjs [path-to-chrome]
import http from "node:http";
import { join } from "node:path";

import {
  Cdp,
  findExtensionId,
  launchChromium,
  PLAYWRIGHT_CHROMIUM,
  wakeServiceWorker,
} from "./lib/cdp.mjs";

const CHROME = process.argv[2] ?? PLAYWRIGHT_CHROMIUM;
const DIST = join(process.cwd(), "dist-test");
const PORT = 9444;

// Known element: 300x150 at (100,120) in a marginless page.
const TARGET = { x: 100, y: 120, width: 300, height: 150 };
const FIXTURE = `<!doctype html>
<html><head><style>html, body { margin: 0; }</style></head>
<body>
  <div id="target" style="position:absolute;left:${TARGET.x}px;top:${TARGET.y}px;width:${TARGET.width}px;height:${TARGET.height}px;background:#ccc"></div>
</body></html>`;

const server = http.createServer((_req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(FIXTURE);
});

const { base, shutdown } = launchChromium({
  chromePath: CHROME,
  dist: DIST,
  port: PORT,
  headless: true,
});

function near(a, b, epsilon = 1) {
  return Math.abs(a - b) <= epsilon;
}

async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const pageUrl = `http://127.0.0.1:${server.address().port}/`;

  const ours = await findExtensionId(base, "AccuRuler");
  const { page, sw, pageTarget } = await wakeServiceWorker(base, ours.id);

  // Load the fixture page (page target was parked on background.js).
  await page.call("Page.navigate", { url: pageUrl });
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Inject the content script and grab the fixture tab id.
  const injected = JSON.parse(
    await sw.evaluate(
      `(async () => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => t.url && t.url.startsWith("http://127.0.0.1:"));
        if (!tab) return JSON.stringify({ ok: false, error: "fixture tab not found" });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        await new Promise((r) => setTimeout(r, 300));
        return JSON.stringify({ ok: true, tabId: tab.id });
      })()`,
    ),
  );
  if (!injected.ok) throw new Error(`injection failed: ${JSON.stringify(injected)}`);
  const tabId = injected.tabId;

  const getState = () =>
    sw.evaluate(
      `chrome.tabs.sendMessage(${tabId}, { type: "accuruler:getState" }).catch((e) => ({ error: String(e) }))`,
    );

  // Shield present and ruler armed.
  const shieldPresent = await page.evaluate(
    `document.querySelector("[data-accu-ruler]") !== null`,
  );
  if (!shieldPresent) throw new Error("overlay shield not in the page");

  // Drag from the element's top-left to bottom-right.
  const x1 = TARGET.x;
  const y1 = TARGET.y;
  const x2 = TARGET.x + TARGET.width;
  const y2 = TARGET.y + TARGET.height;
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
  await new Promise((resolve) => setTimeout(resolve, 300));

  const state = await getState();
  if (state.error) throw new Error(`getState failed: ${JSON.stringify(state)}`);

  // Compare against the element's actual box.
  const expected = JSON.parse(
    await page.evaluate(
      `(() => { const r = document.getElementById("target").getBoundingClientRect(); return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height }); })()`,
    ),
  );
  const rect = state.rect;
  const checks = [
    state.active,
    rect !== null,
    near(rect.x, expected.x) && near(rect.y, expected.y),
    near(rect.width, expected.width) && near(rect.height, expected.height),
    state.labels?.size === `${TARGET.width} × ${TARGET.height}`,
    state.labels?.start === `start (${TARGET.x}, ${TARGET.y})`,
    state.labels?.end === `end (${TARGET.x + TARGET.width}, ${TARGET.y + TARGET.height})`,
  ];
  console.log("measured rect:", JSON.stringify(rect));
  console.log("expected rect:", JSON.stringify(expected));
  console.log("labels:", JSON.stringify(state.labels));
  if (!checks.every(Boolean)) {
    throw new Error(`measurement checks failed: ${JSON.stringify(checks)}`);
  }

  // Esc clears the ruler but keeps the shield armed.
  await page.call("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Escape", code: "Escape",
    windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
  });
  await page.call("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Escape", code: "Escape",
    windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const afterEsc = await getState();
  if (afterEsc.rect !== null) {
    throw new Error(`Esc did not clear the ruler: ${JSON.stringify(afterEsc)}`);
  }

  // Esc DURING a drag cancels it: press down, move a little, hit Esc while the
  // button is still held, move more, then release — no ruler may remain.
  await page.call("Input.dispatchMouseEvent", {
    type: "mousePressed", x: 150, y: 150, button: "left", clickCount: 1,
  });
  await page.call("Input.dispatchMouseEvent", {
    type: "mouseMoved", x: 200, y: 180, button: "left", buttons: 1,
  });
  await page.call("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Escape", code: "Escape",
    windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
  });
  await page.call("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Escape", code: "Escape",
    windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
  });
  await page.call("Input.dispatchMouseEvent", {
    type: "mouseMoved", x: 300, y: 260, button: "left", buttons: 1,
  });
  await page.call("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: 300, y: 260, button: "left", clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const duringDrag = await getState();
  if (duringDrag.rect !== null) {
    throw new Error(
      `Esc during drag did not cancel: ${JSON.stringify(duringDrag)}`,
    );
  }
  const shieldStillArmed = await page.evaluate(
    `document.querySelector("[data-accu-ruler]") !== null`,
  );
  if (!shieldStillArmed) {
    throw new Error("shield disappeared after Esc-cancel of a drag");
  }

  console.log("P1 measurement test PASSED");
  page.close();
  sw.close();
}

main()
  .catch((error) => {
    console.error("P1 measurement test FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    server.close();
    await shutdown();
  });