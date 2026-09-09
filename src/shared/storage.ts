import browser from "webextension-polyfill";

import type { Unit } from "./units";

/** Ruler appearance + units, persisted via browser.storage.sync. */
export interface Settings {
  /** When true, border/crosshair/labels flip black↔white for contrast. */
  autoContrast: boolean;
  borderColor: string;
  fillColor: string;
  /** 0 = no fill; 1 = fully opaque. Only applied when autoContrast is off. */
  fillOpacity: number;
  labelBackground: string;
  units: Unit;
}

export const DEFAULT_SETTINGS: Settings = {
  autoContrast: true,
  borderColor: "#e11d48",
  fillColor: "#e11d48",
  fillOpacity: 0,
  labelBackground: "#111827",
  units: "css",
};

const STORAGE_KEY = "settings";

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get(STORAGE_KEY);
  return normalizeSettings(stored[STORAGE_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.sync.set({ [STORAGE_KEY]: normalizeSettings(settings) });
}

function normalizeSettings(value: unknown): Settings {
  const raw = (value ?? {}) as Partial<Settings>;
  return {
    autoContrast:
      typeof raw.autoContrast === "boolean"
        ? raw.autoContrast
        : DEFAULT_SETTINGS.autoContrast,
    borderColor: isHexColor(raw.borderColor)
      ? raw.borderColor
      : DEFAULT_SETTINGS.borderColor,
    fillColor: isHexColor(raw.fillColor)
      ? raw.fillColor
      : DEFAULT_SETTINGS.fillColor,
    fillOpacity:
      typeof raw.fillOpacity === "number"
        ? clamp01(raw.fillOpacity)
        : DEFAULT_SETTINGS.fillOpacity,
    labelBackground: isHexColor(raw.labelBackground)
      ? raw.labelBackground
      : DEFAULT_SETTINGS.labelBackground,
    units:
      raw.units === "physical" || raw.units === "mm" || raw.units === "cm"
        ? raw.units
        : "css",
  };
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}