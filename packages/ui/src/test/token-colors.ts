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

// A browser serializes one box-shadow layer as "<color> <x> <y> <blur> <spread>[ inset]", so
// matching that whole layer pins the boundary's exact width and the fact that it is painted
// inside the element: a wider spread, or the same spread painted outside as a halo, no longer
// passes. Substring-matching the width alone would accept both.
export function insetBoundary(token: string, width: string): string {
  return `${tokenRgb(token)} 0px 0px 0px ${width} inset`;
}

// Tailwind composes `shadow-none` into its own shadow layers set to fully transparent rather
// than into the literal "none", so "this element draws no boundary of its own" is not a string
// comparison: it is that every layer the browser does report paints nothing. Returning the
// layers that do paint, instead of a boolean, puts the offending one in the failure message.
export function paintedBoxShadowLayers(element: HTMLElement): string[] {
  const boxShadow = getComputedStyle(element).boxShadow;
  if (boxShadow === "none") {
    return [];
  }
  // A layer is "<color> <x> <y> <blur> <spread>[ inset]" and the browser serializes color first,
  // so splitting on the commas that separate layers means skipping the ones inside rgb()/rgba().
  return boxShadow
    .split(/,(?![^(]*\))/)
    .map((layer) => layer.trim())
    .filter((layer) => !layer.startsWith("rgba(0, 0, 0, 0) "));
}

// Extracts an element's own painted boundary color as "#rrggbb", for feeding into
// contrastRatio() alongside the fill it sits on. A box-shadow layer serializes as "<color> <x>
// <y> <blur> <spread>[ inset]", so the color is always the leading rgb()/rgba() substring; this
// only handles a single-layer boundary (a checked ring replaces the resting border rather than
// stacking under it), which is the only shape this package's controls draw.
export function boundaryColorHex(element: HTMLElement): string {
  const [layer, ...rest] = paintedBoxShadowLayers(element);
  if (!layer) {
    throw new Error("Element draws no boundary of its own");
  }
  if (rest.length > 0) {
    throw new Error(`Element draws more than one boundary layer: ${[layer, ...rest].join(", ")}`);
  }
  const color = layer.match(/^rgba?\([^)]*\)/)?.[0];
  if (!color) {
    throw new Error(`Could not parse a boundary color from box-shadow layer: "${layer}"`);
  }
  return rgbToHex(color);
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
