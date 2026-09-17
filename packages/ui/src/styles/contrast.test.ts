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

const uiTones = [
  "brand-blue-ui",
  "brand-green-ui",
  "brand-earth-ui",
  "status-error-ui",
  "status-warning-ui",
];

const strongTones = [
  "brand-blue-strong",
  "brand-green-strong",
  "brand-earth-strong",
  "status-error-strong",
  "status-warning-strong",
];

function itReachesContrastAgainstEverySurface(tones: string[], threshold: number) {
  for (const tone of tones) {
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

  itReachesContrastAgainstEverySurface(uiTones, AA_TEXT_CONTRAST);
  itReachesContrastAgainstEverySurface(strongTones, AAA_TEXT_CONTRAST);
});
