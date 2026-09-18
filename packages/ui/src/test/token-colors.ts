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

// Reads a "--color-<name>" token's computed color the way the browser itself renders it, instead
// of parsing its hex text: an 8-digit alpha token (e.g. a backdrop or shadow tint) compiles to an
// "rgba(...)" string whose alpha channel is rounded by the browser, which hexToRgb/tokenRgb above
// can't reproduce byte-for-byte since they only parse opaque 6-digit hex. A probe element run
// through the same browser round-trip as the component under test avoids that mismatch entirely.
export function tokenBackgroundColor(name: string): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = `var(--color-${name})`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return value;
}

// Converts a "rgb(r, g, b)" computed style value back to "#rrggbb" for contrastRatio().
export function rgbToHex(rgb: string): string {
  const channels = rgb.match(/\d+/g);
  if (channels?.length !== 3) {
    throw new Error(`Not an opaque rgb() color: ${rgb}`);
  }
  return `#${channels.map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`;
}
