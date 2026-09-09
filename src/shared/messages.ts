/**
 * Message contract between the background service worker and the injected
 * content script. Single source of truth for wire types on both sides.
 */

export const Messages = {
  Teardown: "accuruler:teardown",
  GetState: "accuruler:getState",
} as const;

export type RuntimeMessage = { type: (typeof Messages)[keyof typeof Messages] };

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RulerThemeState {
  border: string;
  crosshair: string;
  labelBackground: string;
  labelForeground: string;
  fill: string | null;
}

/** Snapshot of the ruler state, returned for the GetState message. */
export interface RulerState {
  active: boolean;
  /** Current crosshair color (set as soon as the pointer moves over the page). */
  crosshair: string | null;
  rect: LabelBox | null;
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
  labels: { size: string; start: string; end: string } | null;
  placement: { size: string; start: string; end: string } | null;
  labelBoxes: { size: LabelBox; start: LabelBox; end: LabelBox } | null;
  theme: RulerThemeState | null;
  dpr: number;
  units: string;
}

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(Messages).includes(
      (value as { type?: unknown }).type as never,
    )
  );
}