export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

// WCAG 2.x AA minimum contrast ratio for normal-size text (https://www.w3.org/TR/WCAG21/#contrast-minimum).
export const AA_TEXT_CONTRAST = 4.5;

// WCAG 2.x AAA minimum for normal-size text (https://www.w3.org/TR/WCAG21/#contrast-enhanced).
export const AAA_TEXT_CONTRAST = 7;

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;

// Throws instead of silently parsing to rgb(0, 0, 0), which a missing or malformed token
// (an empty custom property, a typo'd name, a 3-digit hex) would otherwise produce unnoticed.
export function hexToRgb(hex: string): RgbColor {
  if (!HEX_COLOR_PATTERN.test(hex)) {
    throw new Error(`Not a 6-digit hex color: "${hex}"`);
  }
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function channelLuminance(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }: RgbColor): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

// WCAG 2.x contrast ratio formula (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio).
export function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexToRgb(hexA));
  const luminanceB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}
