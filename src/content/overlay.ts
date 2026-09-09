import type { Point, Rect } from "./measure";

export interface RulerTheme {
  border: string;
  crosshair: string;
  labelBackground: string;
  labelForeground: string;
  /** null = transparent (auto-contrast mode or fill off). */
  fill: string | null;
}

export interface LabelText {
  size: string;
  start: string;
  end: string;
}

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SizeLabelSide = "above" | "below" | "inside";
export type CornerLabelSide =
  | "outside-top"
  | "outside-left"
  | "outside-bottom"
  | "outside-right"
  | "inside";

export interface LabelPlacement {
  size: { box: LabelBox; side: SizeLabelSide };
  start: { box: LabelBox; side: CornerLabelSide };
  end: { box: LabelBox; side: CornerLabelSide };
}

export interface OverlayHandle {
  readonly host: HTMLElement;
  updateCrosshair(point: Point, crosshairColor: string): void;
  update(
    rect: Rect | null,
    labels: LabelText,
    theme: RulerTheme,
  ): LabelPlacement | null;
  destroy(): void;
}

const Z_INDEX_MAX = 2147483647;
const LABEL_GAP_PX = 6;
const MARGIN_PX = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function boxOf(el: HTMLElement): LabelBox {
  return {
    x: el.offsetLeft,
    y: el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

function boxesIntersect(a: LabelBox, b: LabelBox): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Keep labels from covering each other. The size label is fixed; start/end are
 * pushed away (prefer right, then left, then stacked below) and clamped to the
 * viewport.
 */
function resolveLabelCollisions(
  size: LabelBox,
  start: LabelBox,
  end: LabelBox,
  viewportWidth: number,
  viewportHeight: number,
): { start: LabelBox; end: LabelBox } {
  const pushAway = (movable: LabelBox, fixed: LabelBox): LabelBox => {
    const right: LabelBox = {
      x: fixed.x + fixed.width + LABEL_GAP_PX,
      y: clamp(movable.y, MARGIN_PX, viewportHeight - movable.height - MARGIN_PX),
      width: movable.width,
      height: movable.height,
    };
    if (right.x + right.width <= viewportWidth - MARGIN_PX && !boxesIntersect(right, size)) {
      return right;
    }
    const left: LabelBox = {
      x: fixed.x - movable.width - LABEL_GAP_PX,
      y: clamp(movable.y, MARGIN_PX, viewportHeight - movable.height - MARGIN_PX),
      width: movable.width,
      height: movable.height,
    };
    if (left.x >= MARGIN_PX && !boxesIntersect(left, size)) {
      return left;
    }
    const below: LabelBox = {
      x: clamp(movable.x, MARGIN_PX, viewportWidth - movable.width - MARGIN_PX),
      y: fixed.y + fixed.height + LABEL_GAP_PX,
      width: movable.width,
      height: movable.height,
    };
    if (below.y + below.height <= viewportHeight - MARGIN_PX) {
      return below;
    }
    return movable;
  };

  let resolvedStart = start;
  let resolvedEnd = end;
  if (boxesIntersect(size, resolvedStart)) {
    resolvedStart = pushAway(resolvedStart, size);
  }
  if (boxesIntersect(size, resolvedEnd)) {
    resolvedEnd = pushAway(resolvedEnd, size);
  }
  if (boxesIntersect(resolvedStart, resolvedEnd)) {
    resolvedEnd = pushAway(resolvedEnd, resolvedStart);
  }
  return { start: resolvedStart, end: resolvedEnd };
}

/**
 * Full-viewport shield host with a closed shadow DOM, so page CSS can never
 * reach the ruler. While the ruler is active the page is not interactive and
 * cannot scroll (wheel is blocked), which keeps clientX/Y measurements stable.
 *
 * Smart label placement keeps every label OUTSIDE the measured box when there
 * is room, flipping to the opposite side or inside only when the viewport or
 * the box leaves no outside space.
 */
export function createOverlay(): OverlayHandle {
  const host = document.createElement("div");
  host.setAttribute("data-accu-ruler", "");
  host.style.cssText = [
    "all:initial",
    "position:fixed",
    "inset:0",
    `z-index:${Z_INDEX_MAX}`,
    "pointer-events:auto",
    "touch-action:none",
    "cursor:none",
  ].join(";");

  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; display: block; }
    .rect {
      position: absolute;
      box-sizing: border-box;
      outline: 1px solid var(--ruler-border);
      background: var(--rect-fill);
      pointer-events: none;
    }
    .label {
      position: absolute;
      box-sizing: border-box;
      background: var(--label-background);
      color: var(--label-foreground);
      font: 11px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      padding: 2px 5px;
      border-radius: 3px;
      white-space: nowrap;
      pointer-events: none;
      user-select: none;
    }
    .crosshair {
      position: absolute;
      width: 0;
      height: 0;
      display: none;
      pointer-events: none;
    }
    .crosshair .arm-h {
      position: absolute;
      left: -11px;
      top: -1px;
      width: 22px;
      height: 2px;
      background: var(--crosshair);
    }
    .crosshair .arm-v {
      position: absolute;
      left: -1px;
      top: -11px;
      width: 2px;
      height: 22px;
      background: var(--crosshair);
    }
  `;
  const rectEl = document.createElement("div");
  rectEl.className = "rect";
  const sizeLabel = document.createElement("div");
  sizeLabel.className = "label";
  const startLabel = document.createElement("div");
  startLabel.className = "label";
  const endLabel = document.createElement("div");
  endLabel.className = "label";
  const crosshair = document.createElement("div");
  crosshair.className = "crosshair";
  const armH = document.createElement("div");
  armH.className = "arm-h";
  const armV = document.createElement("div");
  armV.className = "arm-v";
  crosshair.append(armH, armV);
  shadow.append(style, rectEl, sizeLabel, startLabel, endLabel, crosshair);

  function applyTheme(theme: RulerTheme): void {
    host.style.setProperty("--ruler-border", theme.border);
    host.style.setProperty("--crosshair", theme.crosshair);
    host.style.setProperty("--label-background", theme.labelBackground);
    host.style.setProperty("--label-foreground", theme.labelForeground);
    host.style.setProperty("--rect-fill", theme.fill ?? "transparent");
  }

  function hideAll(): void {
    for (const el of [rectEl, sizeLabel, startLabel, endLabel]) {
      el.style.display = "none";
    }
  }

  function updateCrosshair(point: Point, crosshairColor: string): void {
    host.style.setProperty("--crosshair", crosshairColor);
    crosshair.style.display = "block";
    crosshair.style.left = `${point.x}px`;
    crosshair.style.top = `${point.y}px`;
  }

  function update(
    rect: Rect | null,
    labels: LabelText,
    theme: RulerTheme,
  ): LabelPlacement | null {
    if (rect === null) {
      hideAll();
      return null;
    }
    applyTheme(theme);

    rectEl.style.display = "block";
    rectEl.style.left = `${rect.x}px`;
    rectEl.style.top = `${rect.y}px`;
    rectEl.style.width = `${rect.width}px`;
    rectEl.style.height = `${rect.height}px`;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    sizeLabel.style.display = "block";
    sizeLabel.textContent = labels.size;
    startLabel.style.display = "block";
    startLabel.textContent = labels.start;
    endLabel.style.display = "block";
    endLabel.textContent = labels.end;

    const sWidth = sizeLabel.offsetWidth;
    const sHeight = sizeLabel.offsetHeight;
    const startWidth = startLabel.offsetWidth;
    const startHeight = startLabel.offsetHeight;
    const endWidth = endLabel.offsetWidth;
    const endHeight = endLabel.offsetHeight;

    // Size label: above the box; below it if the top edge is too close to the
    // viewport top; inside top-center only as a last resort.
    let sizeSide: SizeLabelSide;
    let sizeTop: number;
    if (rect.y - sHeight - LABEL_GAP_PX >= MARGIN_PX) {
      sizeSide = "above";
      sizeTop = rect.y - sHeight - LABEL_GAP_PX;
    } else if (rect.y + rect.height + sHeight + LABEL_GAP_PX <= viewportHeight - MARGIN_PX) {
      sizeSide = "below";
      sizeTop = rect.y + rect.height + LABEL_GAP_PX;
    } else {
      sizeSide = "inside";
      sizeTop = rect.y + LABEL_GAP_PX;
    }
    const sizeLeft = clamp(
      rect.x + rect.width / 2 - sWidth / 2,
      MARGIN_PX,
      viewportWidth - sWidth - MARGIN_PX,
    );
    const sizeBox: LabelBox = { x: sizeLeft, y: sizeTop, width: sWidth, height: sHeight };

    // Start label (top-left corner): outside above the corner, else outside to
    // the left, else just inside.
    const startX = rect.x;
    const startY = rect.y;
    let startSide: CornerLabelSide;
    let startLeft: number;
    let startTop: number;
    if (startY - startHeight - LABEL_GAP_PX >= MARGIN_PX) {
      startSide = "outside-top";
      startLeft = clamp(startX, MARGIN_PX, viewportWidth - startWidth - MARGIN_PX);
      startTop = startY - startHeight - LABEL_GAP_PX;
    } else if (startX - startWidth - LABEL_GAP_PX >= MARGIN_PX) {
      startSide = "outside-left";
      startLeft = startX - startWidth - LABEL_GAP_PX;
      startTop = clamp(startY, MARGIN_PX, viewportHeight - startHeight - MARGIN_PX);
    } else {
      startSide = "inside";
      startLeft = clamp(startX + LABEL_GAP_PX, MARGIN_PX, viewportWidth - startWidth - MARGIN_PX);
      startTop = clamp(startY + LABEL_GAP_PX, MARGIN_PX, viewportHeight - startHeight - MARGIN_PX);
    }
    const startBox: LabelBox = { x: startLeft, y: startTop, width: startWidth, height: startHeight };

    // End label (bottom-right corner): outside below, else outside to the
    // right, else just inside.
    const endX = rect.x + rect.width;
    const endY = rect.y + rect.height;
    let endSide: CornerLabelSide;
    let endLeft: number;
    let endTop: number;
    if (endY + endHeight + LABEL_GAP_PX <= viewportHeight - MARGIN_PX) {
      endSide = "outside-bottom";
      endLeft = clamp(endX - endWidth, MARGIN_PX, viewportWidth - endWidth - MARGIN_PX);
      endTop = endY + LABEL_GAP_PX;
    } else if (endX + endWidth + LABEL_GAP_PX <= viewportWidth - MARGIN_PX) {
      endSide = "outside-right";
      endLeft = endX + LABEL_GAP_PX;
      endTop = clamp(endY - endHeight, MARGIN_PX, viewportHeight - endHeight - MARGIN_PX);
    } else {
      endSide = "inside";
      endLeft = clamp(endX - endWidth - LABEL_GAP_PX, MARGIN_PX, viewportWidth - endWidth - MARGIN_PX);
      endTop = clamp(endY - endHeight - LABEL_GAP_PX, MARGIN_PX, viewportHeight - endHeight - MARGIN_PX);
    }
    const endBox: LabelBox = { x: endLeft, y: endTop, width: endWidth, height: endHeight };

    // Resolve label-vs-label collisions (size stays put; start/end are pushed
    // away so labels never cover each other).
    const resolved = resolveLabelCollisions(
      sizeBox,
      startBox,
      endBox,
      viewportWidth,
      viewportHeight,
    );

    sizeLabel.style.left = `${sizeBox.x}px`;
    sizeLabel.style.top = `${sizeBox.y}px`;
    startLabel.style.left = `${resolved.start.x}px`;
    startLabel.style.top = `${resolved.start.y}px`;
    endLabel.style.left = `${resolved.end.x}px`;
    endLabel.style.top = `${resolved.end.y}px`;

    return {
      size: { box: boxOf(sizeLabel), side: sizeSide },
      start: { box: boxOf(startLabel), side: startSide },
      end: { box: boxOf(endLabel), side: endSide },
    };
  }

  function destroy(): void {
    host.remove();
  }

  return { host, updateCrosshair, update, destroy };
}