import browser from "webextension-polyfill";

import {
  Messages,
  isRuntimeMessage,
  type RulerState,
} from "../shared/messages";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  type Settings,
} from "../shared/storage";
import {
  formatEnd,
  formatSize,
  formatStart,
  rectFromPoints,
  type Point,
  type Rect,
} from "./measure";
import {
  createOverlay,
  type LabelPlacement,
  type LabelText,
  type OverlayHandle,
  type RulerTheme,
} from "./overlay";
import { autoThemeAt, contrastTextColor, withAlpha } from "./contrast";

/**
 * Ruler lifecycle inside the page. The overlay is a closed shadow-DOM shield
 * covering the viewport while the ruler is active: the page is not interactive
 * (parity with the original tool) and cannot scroll under the ruler, keeping
 * measurements stable.
 *
 * Re-injection is idempotent: if a shield is already on the page this instance
 * exits without creating anything, and teardown removes its own listeners and
 * message handler so stale copies cannot respond or leak.
 */
if (document.querySelector("[data-accu-ruler]") === null) {
  main();
}

const EMPTY_LABELS: LabelText = { size: "", start: "", end: "" };

function main(): void {
  const overlay: OverlayHandle = createOverlay();
  const host = overlay.host;

  let settings: Settings = DEFAULT_SETTINGS;
  let dragStart: Point | null = null;
  let dragCurrent: Point | null = null;
  let lastRect: Rect | null = null;
  let lastTheme: RulerTheme | null = null;
  let lastPlacement: LabelPlacement | null = null;
  let rafId: number | null = null;
  let lastPointerPoint: Point | null = null;
  let crosshairColor: string | null = null;
  let crosshairRafId: number | null = null;

  function labelTexts(rect: Rect): LabelText {
    const dpr = window.devicePixelRatio;
    return {
      size: formatSize(rect.width, rect.height, settings.units, dpr),
      start: formatStart({ x: rect.x, y: rect.y }, settings.units, dpr),
      end: formatEnd(
        { x: rect.x + rect.width, y: rect.y + rect.height },
        settings.units,
        dpr,
      ),
    };
  }

  function resolveTheme(point: Point): RulerTheme {
    if (settings.autoContrast) {
      return autoThemeAt(host, point.x, point.y);
    }
    return {
      border: settings.borderColor,
      crosshair: settings.borderColor,
      labelBackground: settings.labelBackground,
      labelForeground: contrastTextColor(settings.labelBackground),
      fill:
        settings.fillOpacity > 0
          ? withAlpha(settings.fillColor, settings.fillOpacity)
          : null,
    };
  }

  function rectCenter(rect: Rect): Point {
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }

  /**
   * Position the crosshair immediately; its auto-contrast color is sampled at
   * most once per animation frame so idle mouse movement stays cheap.
   */
  function showCrosshair(point: Point): void {
    lastPointerPoint = point;
    overlay.updateCrosshair(point, crosshairColor ?? resolveTheme(point).crosshair);
    if (crosshairRafId !== null) return;
    crosshairRafId = requestAnimationFrame(() => {
      crosshairRafId = null;
      if (lastPointerPoint === null) return;
      const color = resolveTheme(lastPointerPoint).crosshair;
      if (crosshairColor !== color) {
        crosshairColor = color;
        overlay.updateCrosshair(lastPointerPoint, color);
      }
    });
  }

  function draw(rect: Rect, themePoint: Point): void {
    const theme = resolveTheme(themePoint);
    lastRect = rect;
    lastTheme = theme;
    lastPlacement = overlay.update(rect, labelTexts(rect), theme);
  }

  function clearRuler(): void {
    dragStart = null;
    dragCurrent = null;
    lastRect = null;
    lastTheme = null;
    lastPlacement = null;
    overlay.update(null, EMPTY_LABELS, resolveTheme({ x: 0, y: 0 }));
  }

  function nudgeRect(dx: number, dy: number): void {
    if (lastRect === null) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = clamp(lastRect.x + dx, 0, Math.max(0, vw - lastRect.width));
    const y = clamp(lastRect.y + dy, 0, Math.max(0, vh - lastRect.height));
    lastRect = { ...lastRect, x, y };
    lastTheme = resolveTheme(rectCenter(lastRect));
    lastPlacement = overlay.update(lastRect, labelTexts(lastRect), lastTheme);
  }

  function scheduleDraw(): void {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (dragStart !== null && dragCurrent !== null) {
        draw(rectFromPoints(dragStart, dragCurrent), dragCurrent);
      }
    });
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || dragStart !== null) return;
    event.preventDefault();
    dragStart = { x: event.clientX, y: event.clientY };
    dragCurrent = { ...dragStart };
    host.setPointerCapture(event.pointerId);
    showCrosshair(dragStart);
    scheduleDraw();
  }

  function onPointerMove(event: PointerEvent): void {
    showCrosshair({ x: event.clientX, y: event.clientY });
    if (dragStart === null) return;
    event.preventDefault();
    dragCurrent = { x: event.clientX, y: event.clientY };
    scheduleDraw();
  }

  function onPointerUp(event: PointerEvent): void {
    showCrosshair({ x: event.clientX, y: event.clientY });
    if (dragStart === null) return;
    event.preventDefault();
    dragCurrent = { x: event.clientX, y: event.clientY };
    const rect = rectFromPoints(dragStart, dragCurrent);
    dragStart = null;
    dragCurrent = null;
    draw(rect, rectCenter(rect));
  }

  function onPointerCancel(): void {
    if (dragStart === null) return;
    clearRuler();
  }

  const ARROW_DELTAS: Record<string, Point> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  };

  function onKeyDown(event: KeyboardEvent): void {
    const delta = ARROW_DELTAS[event.key];
    if (delta !== undefined) {
      // Also prevents the page from scrolling while the ruler is active.
      event.preventDefault();
      if (lastRect !== null) {
        const step = event.shiftKey ? 10 : 1;
        nudgeRect(delta.x * step, delta.y * step);
      }
      return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (dragStart !== null || lastRect !== null) {
      clearRuler();
    }
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
  }

  function onContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  function buildState(): RulerState {
    const rect = lastRect;
    return {
      active: true,
      crosshair: crosshairColor,
      rect,
      start: rect ? { x: rect.x, y: rect.y } : null,
      end: rect ? { x: rect.x + rect.width, y: rect.y + rect.height } : null,
      labels: rect ? labelTexts(rect) : null,
      placement: lastPlacement
        ? {
            size: lastPlacement.size.side,
            start: lastPlacement.start.side,
            end: lastPlacement.end.side,
          }
        : null,
      labelBoxes: lastPlacement
        ? {
            size: lastPlacement.size.box,
            start: lastPlacement.start.box,
            end: lastPlacement.end.box,
          }
        : null,
      theme: lastTheme
        ? {
            border: lastTheme.border,
            crosshair: lastTheme.crosshair,
            labelBackground: lastTheme.labelBackground,
            labelForeground: lastTheme.labelForeground,
            fill: lastTheme.fill,
          }
        : null,
      dpr: window.devicePixelRatio,
      units: settings.units,
    };
  }

  const messageHandler = (
    message: unknown,
    _sender: unknown,
    sendResponse: (response: unknown) => void,
  ): true => {
    if (!isRuntimeMessage(message)) {
      sendResponse(undefined);
      return true;
    }
    if (message.type === Messages.Teardown) {
      teardown();
    } else if (message.type === Messages.GetState) {
      sendResponse(buildState());
      return true;
    }
    sendResponse(undefined);
    return true;
  };

  const storageListener = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ): void => {
    if (area !== "sync" || changes.settings === undefined) return;
    settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue as Partial<Settings>) };
    crosshairColor = null;
    if (lastPointerPoint !== null) {
      showCrosshair(lastPointerPoint);
    }
    if (lastRect !== null) {
      lastTheme = resolveTheme(rectCenter(lastRect));
      lastPlacement = overlay.update(lastRect, labelTexts(lastRect), lastTheme);
    }
  };

  function teardown(): void {
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (crosshairRafId !== null) cancelAnimationFrame(crosshairRafId);
    overlay.destroy();
    host.removeEventListener("pointerdown", onPointerDown);
    host.removeEventListener("pointermove", onPointerMove);
    host.removeEventListener("pointerup", onPointerUp);
    host.removeEventListener("pointercancel", onPointerCancel);
    host.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeyDown);
    browser.runtime.onMessage.removeListener(messageHandler);
    browser.storage.onChanged.removeListener(storageListener);
  }

  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointercancel", onPointerCancel);
  host.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  browser.runtime.onMessage.addListener(messageHandler);
  browser.storage.onChanged.addListener(storageListener);

  document.documentElement.appendChild(host);

  void loadSettings().then((loaded) => {
    settings = loaded;
    if (lastRect !== null) {
      lastTheme = resolveTheme(rectCenter(lastRect));
      lastPlacement = overlay.update(lastRect, labelTexts(lastRect), lastTheme);
    }
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}