import browser from "webextension-polyfill";

import { Messages, type RuntimeMessage } from "./shared/messages";

const BADGE_ACTIVE_TEXT = "On";
const CONTENT_SCRIPT_FILE = "content.js";

/**
 * Source of truth for which tabs have the ruler active. Kept in-memory in the
 * service worker; page navigation/close (which destroys the injected script)
 * clears the entry, and idempotent inject makes re-enabling safe.
 */
const activeTabs = new Set<number>();

function setBadgeActive(tabId: number, active: boolean): void {
  void browser.action.setBadgeText({
    tabId,
    text: active ? BADGE_ACTIVE_TEXT : "",
  });
}

async function enableRuler(tabId: number): Promise<void> {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
  } catch (error) {
    // activeTab does not grant access to browser-internal pages
    // (chrome://, Web Store, PDF viewer). Report and keep the badge off.
    console.warn(`AccuRuler: cannot inject into tab ${tabId}`, error);
    return;
  }
  activeTabs.add(tabId);
  setBadgeActive(tabId, true);
}

async function disableRuler(tabId: number): Promise<void> {
  activeTabs.delete(tabId);
  setBadgeActive(tabId, false);
  const message: RuntimeMessage = { type: Messages.Teardown };
  // The content script may already be gone (e.g. the page navigated); that is
  // not an error worth surfacing.
  await browser.tabs.sendMessage(tabId, message).catch(() => undefined);
}

async function toggleRuler(tabId: number): Promise<void> {
  if (activeTabs.has(tabId)) {
    await disableRuler(tabId);
  } else {
    await enableRuler(tabId);
  }
}

browser.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) {
    return;
  }
  void toggleRuler(tab.id);
});

// The injected script dies with the page: drop state and badge on any
// navigation or tab close so we never get stuck "active".
function clearTabState(tabId: number): void {
  if (activeTabs.delete(tabId)) {
    setBadgeActive(tabId, false);
  }
}

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    clearTabState(tabId);
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  clearTabState(tabId);
});
