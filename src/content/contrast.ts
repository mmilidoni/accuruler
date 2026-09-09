import type { RulerTheme } from "./overlay";

/**
 * Auto-contrast engine: samples the effective background color under a point
 * and picks a light or dark chrome that stays visible on it (fixes the #1
 * Page Ruler complaint — invisible cursor/labels on dark backgrounds).
 */

const DARK_CHROME: RulerTheme = {
  border: "#111111",
  crosshair: "#111111",
  labelBackground: "#111111",
  labelForeground: "#ffffff",
  fill: null,
};

const LIGHT_CHROME: RulerTheme = {
  border: "#ffffff",
  crosshair: "#ffffff",
  labelBackground: "#ffffff",
  labelForeground: "#111111",
  fill: null,
};

export function autoThemeAt(host: Element, x: number, y: number): RulerTheme {
  const { r, g, b } = sampleBackground(host, x, y);
  return relativeLuminance(r, g, b) >= 0.5 ? DARK_CHROME : LIGHT_CHROME;
}

/** Black or white text that contrasts with the given background color. */
export function contrastTextColor(backgroundHex: string): string {
  const rgb = hexToRgb(backgroundHex);
  if (rgb === null) return "#ffffff";
  return relativeLuminance(rgb.r, rgb.g, rgb.b) >= 0.5 ? "#111111" : "#ffffff";
}

export function withAlpha(hexColor: string, opacity: number): string {
  const rgb = hexToRgb(hexColor);
  if (rgb === null) return "rgba(0, 0, 0, 0)";
  const alpha = Math.round(opacity * 100) / 100;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * The overlay shield is a pointer-events:auto element, so hit-testing at a
 * point would return it. Temporarily disable its pointer-events to sample
 * what the user actually sees underneath.
 */
function sampleBackground(
  host: Element,
  x: number,
  y: number,
): { r: number; g: number; b: number } {
  const hostEl = host as HTMLElement;
  const previous = hostEl.style.pointerEvents;
  hostEl.style.pointerEvents = "none";
  const stack = document.elementsFromPoint(x, y);
  hostEl.style.pointerEvents = previous;

  const target =
    stack.find((el) => el !== host && !host.contains(el)) ?? document.body;

  // Composite the ancestor chain bottom-up over a white canvas.
  const colors: { r: number; g: number; b: number; a: number }[] = [];
  let node: Element | null = target;
  while (node !== null) {
    const rgba = parseRgbColor(getComputedStyle(node).backgroundColor);
    if (rgba !== null) {
      colors.push(rgba);
      if (rgba.a >= 0.999) break;
    }
    node = node.parentElement;
  }

  let acc = { r: 255, g: 255, b: 255 };
  for (let i = colors.length - 1; i >= 0; i--) {
    const c = colors[i]!;
    acc = {
      r: Math.round(c.r * c.a + acc.r * (1 - c.a)),
      g: Math.round(c.g * c.a + acc.g * (1 - c.a)),
      b: Math.round(c.b * c.a + acc.b * (1 - c.a)),
    };
  }
  return acc;
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function parseRgbColor(
  value: string,
): { r: number; g: number; b: number; a: number } | null {
  const match = /^rgba?\((.*)\)$/.exec(value.trim());
  if (!match) return null;
  const parts = match[1]!.split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const r = Number.parseFloat(parts[0]!);
  const g = Number.parseFloat(parts[1]!);
  const b = Number.parseFloat(parts[2]!);
  let a = 1;
  if (parts.length >= 4) {
    const raw = parts[3]!;
    a = raw.includes("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
  }
  if ([r, g, b, a].some(Number.isNaN)) return null;
  return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: clamp01(a) };
}

function hexToRgb(value: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const hex = match[1]!;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}