import { hexToRgb } from "../styles/contrast";

// Converts a "#rrggbb" token value to the "rgb(r, g, b)" form a browser reports from getComputedStyle.
function hexTokenToRgb(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

// Reads a "--color-<name>" custom property from the compiled stylesheet, so expectations are
// derived from the same token source design.pen and tokens.css agree on, never hardcoded.
export function tokenRgb(name: string): string {
  return hexTokenToRgb(
    getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim(),
  );
}

// Converts a "rgb(r, g, b)" computed style value back to "#rrggbb" for contrastRatio().
export function rgbToHex(rgb: string): string {
  const channels = rgb.match(/\d+/g);
  if (channels?.length !== 3) {
    throw new Error(`Not an opaque rgb() color: ${rgb}`);
  }
  return `#${channels.map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`;
}
