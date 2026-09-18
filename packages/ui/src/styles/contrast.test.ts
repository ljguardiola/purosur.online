import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AA_TEXT_CONTRAST, AAA_TEXT_CONTRAST, contrastRatio, hexToRgb } from "./contrast";
import { parseColorTokens } from "./parse-tokens";

describe("contrastRatio", () => {
  it("returns 21:1 for black on white, the WCAG maximum", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 9);
  });

  it("returns 1:1 for identical colors", () => {
    expect(contrastRatio("#4f6c7e", "#4f6c7e")).toBe(1);
  });

  it("does not depend on argument order", () => {
    expect(contrastRatio("#334f60", "#f6f6f4")).toBe(contrastRatio("#f6f6f4", "#334f60"));
  });
});

describe("hexToRgb", () => {
  it("rejects a value that is not a 6-digit hex color", () => {
    expect(() => hexToRgb("")).toThrow();
    expect(() => hexToRgb("#fff")).toThrow();
    expect(() => hexToRgb("not-a-color")).toThrow();
  });
});

const stylesheetPath = fileURLToPath(new URL("./tokens.css", import.meta.url));
const stylesheet = readFileSync(stylesheetPath, "utf-8");
const colors = parseColorTokens(stylesheet);

const backgrounds: Record<string, string> = {
  white: colors["surface-white"] ?? "",
  bone: colors["surface-bone"] ?? "",
  sand: colors["surface-sand"] ?? "",
};

// Every color token declared in tokens.css must land in exactly one of these two lists: a text
// tone (checked against its own contrast threshold below) or a decorative one (checked at all,
// just not for text contrast). A token in neither list fails the classification test, so a new
// color can't be added without someone deciding which bucket it belongs to.
const textTones: Record<string, number> = {
  ink: AA_TEXT_CONTRAST,
  "ink-secondary": AAA_TEXT_CONTRAST,
  "brand-blue-ui": AA_TEXT_CONTRAST,
  "brand-green-ui": AA_TEXT_CONTRAST,
  "brand-earth-ui": AA_TEXT_CONTRAST,
  "status-error-ui": AA_TEXT_CONTRAST,
  "status-warning-ui": AA_TEXT_CONTRAST,
  "brand-blue-strong": AAA_TEXT_CONTRAST,
  "brand-green-strong": AAA_TEXT_CONTRAST,
  "brand-earth-strong": AAA_TEXT_CONTRAST,
  "status-error-strong": AAA_TEXT_CONTRAST,
  "status-warning-strong": AAA_TEXT_CONTRAST,
};

// Surfaces (the backgrounds themselves, not foreground text/icon color), borders (line,
// blue-soft, see tokens.css), and the plain/accent/message-background shades that are only ever
// used as small decorative fills, never as text or icon color.
const decorativeTones = [
  "surface-sand",
  "surface-bone",
  "surface-white",
  "line",
  "blue-soft",
  "brand-blue",
  "brand-blue-message-bg",
  "brand-green",
  "brand-green-message-bg",
  "brand-earth",
  "status-error-accent",
  "status-error-message-bg",
  "status-warning-accent",
  "status-warning-message-bg",
];

function itReachesContrastAgainstEverySurface(tones: Record<string, number>) {
  for (const [tone, threshold] of Object.entries(tones)) {
    for (const [backgroundName, backgroundHex] of Object.entries(backgrounds)) {
      it(`${tone} reaches ${threshold}:1 against ${backgroundName}`, () => {
        const hex = colors[tone];
        expect(hex, `${tone} is missing from the stylesheet`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(contrastRatio(hex as string, backgroundHex)).toBeGreaterThanOrEqual(threshold);
      });
    }
  }
}

describe("design tokens contrast", () => {
  it("reads the white, bone and sand surface tokens from the stylesheet", () => {
    expect(backgrounds.white).toMatch(/^#[0-9a-f]{6}$/i);
    expect(backgrounds.bone).toMatch(/^#[0-9a-f]{6}$/i);
    expect(backgrounds.sand).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("classifies every color token in tokens.css as a text tone or a decorative one", () => {
    const classified = new Set([...Object.keys(textTones), ...decorativeTones]);
    const unclassified = Object.keys(colors).filter((name) => !classified.has(name));

    expect(unclassified).toEqual([]);
  });

  it("classifies each color token only once and only tokens that exist in tokens.css", () => {
    const inBothLists = decorativeTones.filter((name) => name in textTones);
    const stale = [...Object.keys(textTones), ...decorativeTones].filter(
      (name) => !(name in colors),
    );

    expect(inBothLists).toEqual([]);
    expect(stale).toEqual([]);
  });

  itReachesContrastAgainstEverySurface(textTones);
});

// The status indicator paints each tone's text on that tone's own message background, a pairing
// none of the shared white/bone/sand surfaces above cover.
const statusIndicatorTonePairs: Record<string, { text: string; background: string }> = {
  success: { text: "brand-green-strong", background: "brand-green-message-bg" },
  warning: { text: "status-warning-strong", background: "status-warning-message-bg" },
  error: { text: "status-error-strong", background: "status-error-message-bg" },
  info: { text: "brand-blue-strong", background: "brand-blue-message-bg" },
  neutral: { text: "ink-secondary", background: "surface-sand" },
};

describe("status indicator tone contrast", () => {
  for (const [tone, { text, background }] of Object.entries(statusIndicatorTonePairs)) {
    it(`${tone} text reaches ${AAA_TEXT_CONTRAST}:1 against its own background`, () => {
      const textHex = colors[text];
      const backgroundHex = colors[background];

      expect(textHex, `${text} is missing from the stylesheet`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(backgroundHex, `${background} is missing from the stylesheet`).toMatch(
        /^#[0-9a-f]{6}$/i,
      );
      expect(contrastRatio(textHex as string, backgroundHex as string)).toBeGreaterThanOrEqual(
        AAA_TEXT_CONTRAST,
      );
    });
  }
});
