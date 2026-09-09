/**
 * Measurement units for the ruler labels.
 *
 * mm/cm follow the CSS reference assumption 1 inch = 96 CSS px = 25.4 mm
 * (no monitor calibration; browsers do not expose true display DPI).
 */
export type Unit = "css" | "physical" | "mm" | "cm";

const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;

/** Convert a CSS-pixel length to the selected unit (unrounded). */
export function convertCssToUnit(cssPx: number, unit: Unit, dpr: number): number {
  switch (unit) {
    case "css":
      return cssPx;
    case "physical":
      return cssPx * dpr;
    case "mm":
      return (cssPx * MM_PER_INCH) / CSS_PX_PER_INCH;
    case "cm":
      return (cssPx * MM_PER_INCH) / CSS_PX_PER_INCH / 10;
  }
}

/** Round a converted value for display (no unit suffix). */
export function formatNumber(value: number, unit: Unit): string {
  switch (unit) {
    case "css":
    case "physical":
      return String(Math.round(value));
    case "mm":
      return String(Math.round(value * 10) / 10);
    case "cm":
      return String(Math.round(value * 100) / 100);
  }
}

/** Unit suffix for labels: "" for pixel units, " mm" / " cm" otherwise. */
export function unitSuffix(unit: Unit): string {
  if (unit === "mm") return " mm";
  if (unit === "cm") return " cm";
  return "";
}