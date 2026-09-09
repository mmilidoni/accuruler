import cssText from "./options.css?inline";

import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "./shared/storage";
import type { Unit } from "./shared/units";

const style = document.createElement("style");
style.textContent = cssText;
document.head.append(style);

const $ = (id: string): HTMLInputElement =>
  document.getElementById(id) as HTMLInputElement;

const autoContrast = $("auto-contrast");
const border = $("border");
const fill = $("fill");
const fillOpacity = $("fill-opacity");
const fillOpacityValue = $("fill-opacity-value");
const labelBg = $("label-bg");
const units = $("units");
const saveButton = $("save");
const resetButton = $("reset");
const status = $("status");

function readForm(): Settings {
  return {
    autoContrast: autoContrast.checked,
    borderColor: border.value,
    fillColor: fill.value,
    fillOpacity: Number(fillOpacity.value),
    labelBackground: labelBg.value,
    units: units.value as Unit,
  };
}

function writeForm(settings: Settings): void {
  autoContrast.checked = settings.autoContrast;
  border.value = settings.borderColor;
  fill.value = settings.fillColor;
  fillOpacity.value = String(settings.fillOpacity);
  fillOpacityValue.textContent = `${Math.round(settings.fillOpacity * 100)}%`;
  labelBg.value = settings.labelBackground;
  units.value = settings.units;
}

function syncDisabledState(): void {
  const custom = document.getElementById("custom-colors")!;
  custom.setAttribute("aria-disabled", String(autoContrast.checked));
  for (const input of custom.querySelectorAll("input")) {
    input.disabled = autoContrast.checked;
  }
}

function flashStatus(text: string): void {
  status.textContent = text;
  window.setTimeout(() => {
    status.textContent = "";
  }, 2000);
}

async function main(): Promise<void> {
  writeForm(await loadSettings());
  syncDisabledState();

  autoContrast.addEventListener("change", syncDisabledState);
  fillOpacity.addEventListener("input", () => {
    fillOpacityValue.textContent = `${Math.round(Number(fillOpacity.value) * 100)}%`;
  });

  saveButton.addEventListener("click", async () => {
    await saveSettings(readForm());
    flashStatus("Saved");
  });

  resetButton.addEventListener("click", async () => {
    await saveSettings(DEFAULT_SETTINGS);
    writeForm(DEFAULT_SETTINGS);
    syncDisabledState();
    flashStatus("Reset to defaults");
  });
}

void main();