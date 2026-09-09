/** Pure geometry and label formatting. All values are CSS pixels, viewport-relative. */

import {
  convertCssToUnit,
  formatNumber,
  unitSuffix,
  type Unit,
} from "../shared/units";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Normalized rectangle spanned by two arbitrary drag points. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function formatSize(
  widthPx: number,
  heightPx: number,
  unit: Unit,
  dpr: number,
): string {
  const w = formatNumber(convertCssToUnit(widthPx, unit, dpr), unit);
  const h = formatNumber(convertCssToUnit(heightPx, unit, dpr), unit);
  return `${w} × ${h}${unitSuffix(unit)}`;
}

export function formatStart(point: Point, unit: Unit, dpr: number): string {
  return `start (${coord(point.x, unit, dpr)}, ${coord(point.y, unit, dpr)})${unitSuffix(unit)}`;
}

export function formatEnd(point: Point, unit: Unit, dpr: number): string {
  return `end (${coord(point.x, unit, dpr)}, ${coord(point.y, unit, dpr)})${unitSuffix(unit)}`;
}

function coord(valuePx: number, unit: Unit, dpr: number): string {
  return formatNumber(convertCssToUnit(valuePx, unit, dpr), unit);
}