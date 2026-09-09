// Shared helpers for the CDP-based extension tests.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PLAYWRIGHT_CHROMIUM =
  "C:\\Users\\mmilidoni\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Branded Google Chrome ignores --load-extension (Chrome 137+), so tests run
// against Playwright Chromium (or Chrome for Testing).
export function launchChromium({
  chromePath = PLAYWRIGHT_CHROMIUM,
  dist,
  port,
  initialUrl = "about:blank",
  headless = false,
}) {
  const profile = mkdtempSync(join(tmpdir(), "accuruler-"));
  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    ...(headless ? ["--headless=new"] : ["--window-position=-32000,-32000"]),
    "--window-size=1280,800",
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    initialUrl,
  ];
  const chrome = spawn(chromePath, args, { stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;

  return {
    chrome,
    base,
    async shutdown() {
      chrome.kill();
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000);
        chrome.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; temp leftovers are harmless.
      }
    },
  };
}

export async function waitForTarget(base, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`${base}/json/list`)).json();
      const found = targets.find(predicate);
      if (found) return found;
    } catch {
      // Browser not ready yet.
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
}

export class Cdp {
  constructor(webSocketDebuggerUrl) {
    this.ws = new WebSocket(webSocketDebuggerUrl);
  }

  static async connect(target) {
    const cdp = new Cdp(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      cdp.ws.addEventListener("open", resolve);
      cdp.ws.addEventListener("error", reject);
    });
    return cdp;
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 1e9);
      const onMessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id !== id) return;
        this.ws.removeEventListener("message", onMessage);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      };
      this.ws.addEventListener("message", onMessage);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result?.result?.value;
  }

  close() {
    this.ws.close();
  }
}

/** Wake the (lazy) extension service worker by loading its script URL. */
export async function wakeServiceWorker(base, extensionId) {
  const target = await waitForTarget(
    base,
    (t) => t.type === "page",
    20_000,
    "page target",
  );
  const page = await Cdp.connect(target);
  await page.call("Page.enable");
  await page.call("Page.navigate", {
    url: `chrome-extension://${extensionId}/background.js`,
  });
  const worker = await waitForTarget(
    base,
    (t) => t.type === "service_worker" && t.url.includes(extensionId),
    10_000,
    "AccuRuler service worker",
  );
  const sw = await Cdp.connect(worker);
  return { page, sw, pageTarget: target };
}

/** Resolve the extension id for the given name via chrome.developerPrivate. */
export async function findExtensionId(base, name) {
  const page = await waitForTarget(base, (t) => t.type === "page", 20_000, "page");
  const cdp = await Cdp.connect(page);
  await cdp.call("Page.enable");
  await cdp.call("Page.navigate", { url: "chrome://extensions/" });
  await sleep(1200);
  const info = await cdp.evaluate(
    `chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true })
       .then((list) => JSON.stringify(list.map((e) => ({
         id: e.id, name: e.name, version: e.version,
         state: e.state, location: e.location,
         hasErrors: !!e.manifestErrors?.length,
       }))))`,
  );
  const ours = JSON.parse(info ?? "[]").find((e) => e.name === name);
  if (!ours) {
    throw new Error(`${name} not registered; extensions=${info}`);
  }
  if (ours.hasErrors || ours.state !== "ENABLED") {
    throw new Error(`${name} load problem: ${JSON.stringify(ours)}`);
  }
  return ours;
}