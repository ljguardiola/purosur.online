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
  white: colors["surface"] ?? "",
  bone: colors["surface-subtle"] ?? "",
  sand: colors["surface-soft"] ?? "",
};

const textTones = {
  text: AA_TEXT_CONTRAST,
  "text-subtle": AAA_TEXT_CONTRAST,
  "text-accent": AAA_TEXT_CONTRAST,
  "text-eyebrow": AA_TEXT_CONTRAST,
  info: AA_TEXT_CONTRAST,
  success: AA_TEXT_CONTRAST,
  warning: AA_TEXT_CONTRAST,
  error: AA_TEXT_CONTRAST,
  "info-strong": AAA_TEXT_CONTRAST,
  "success-strong": AAA_TEXT_CONTRAST,
  "warning-strong": AAA_TEXT_CONTRAST,
  "error-strong": AAA_TEXT_CONTRAST,
} satisfies Record<string, number>;

// Text drawn over a dark or saturated fill, so each is checked against the fills it sits on
// instead of against the light surfaces.
const inverseTextOnFills: Record<string, Array<{ fill: string; threshold: number }>> = {
  "text-inverse": [
    { fill: "surface-inverse", threshold: AAA_TEXT_CONTRAST },
    { fill: "surface-nav", threshold: AAA_TEXT_CONTRAST },
    { fill: "action", threshold: AA_TEXT_CONTRAST },
    { fill: "action-strong", threshold: AA_TEXT_CONTRAST },
    { fill: "error", threshold: AA_TEXT_CONTRAST },
    { fill: "error-strong", threshold: AA_TEXT_CONTRAST },
    { fill: "success", threshold: AA_TEXT_CONTRAST },
    { fill: "success-strong", threshold: AA_TEXT_CONTRAST },
  ],
  "text-inverse-subtle": [{ fill: "surface-nav", threshold: AA_TEXT_CONTRAST }],
};

// The tints here carry an alpha channel or never carry text, outside contrastRatio()'s opaque
// 6-digit-hex contract.
const decorativeTones = [
  "surface",
  "surface-subtle",
  "surface-soft",
  "surface-inverse",
  "surface-nav",
  "surface-nav-subtle",
  "border",
  "border-strong",
  "border-inverse",
  "border-accent",
  "action-subtle",
  "action-soft",
  "action",
  "action-strong",
  "focus",
  "focus-inverse",
  "info-subtle",
  "info-soft",
  "success-subtle",
  "success-soft",
  "warning-subtle",
  "warning-soft",
  "error-subtle",
  "error-soft",
  "neutral-subtle",
  "neutral",
  "data-subtle",
  "data",
  "backdrop",
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
    expect(backgrounds["white"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(backgrounds["bone"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(backgrounds["sand"]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("classifies every color token in tokens.css as a text tone or a decorative one", () => {
    const classified = new Set([
      ...Object.keys(textTones),
      ...Object.keys(inverseTextOnFills),
      ...decorativeTones,
    ]);
    const unclassified = Object.keys(colors).filter((name) => !classified.has(name));

    expect(unclassified).toEqual([]);
  });

  it("classifies each color token only once and only tokens that exist in tokens.css", () => {
    const textNames = [...Object.keys(textTones), ...Object.keys(inverseTextOnFills)];
    const inBothLists = decorativeTones.filter((name) => textNames.includes(name));
    const stale = [...textNames, ...decorativeTones].filter((name) => !(name in colors));

    expect(inBothLists).toEqual([]);
    expect(stale).toEqual([]);
  });

  itReachesContrastAgainstEverySurface(textTones);
});

describe("inverse text on the fills it sits on contrast", () => {
  for (const [tone, fills] of Object.entries(inverseTextOnFills)) {
    for (const { fill, threshold } of fills) {
      it(`${tone} reaches ${threshold}:1 against ${fill}`, () => {
        const toneHex = colors[tone];
        const fillHex = colors[fill];

        expect(toneHex, `${tone} is missing from the stylesheet`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(fillHex, `${fill} is missing from the stylesheet`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(contrastRatio(toneHex as string, fillHex as string)).toBeGreaterThanOrEqual(
          threshold,
        );
      });
    }
  }
});

const toneOnMessageBackgroundPairs: Record<string, { text: string; background: string }> = {
  success: { text: "success-strong", background: "success-subtle" },
  warning: { text: "warning-strong", background: "warning-subtle" },
  error: { text: "error-strong", background: "error-subtle" },
  info: { text: "info-strong", background: "info-subtle" },
  neutral: { text: "text-subtle", background: "neutral-subtle" },
};

describe("tone text on its own message background contrast", () => {
  for (const [tone, { text, background }] of Object.entries(toneOnMessageBackgroundPairs)) {
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

describe("option card help text on its chosen background contrast", () => {
  it(`text-subtle reaches ${AAA_TEXT_CONTRAST}:1 against action-subtle`, () => {
    const textHex = colors["text-subtle"];
    const backgroundHex = colors["action-subtle"];

    expect(textHex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(backgroundHex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrastRatio(textHex as string, backgroundHex as string)).toBeGreaterThanOrEqual(
      AAA_TEXT_CONTRAST,
    );
  });
});

const rowStateBackgroundNames = ["action-subtle", "warning-subtle", "error-subtle"] as const;

describe("table row state background contrast", () => {
  for (const tone of ["text", "text-subtle"] as const) {
    for (const backgroundName of rowStateBackgroundNames) {
      it(`${tone} reaches ${textTones[tone]}:1 against ${backgroundName}`, () => {
        const textHex = colors[tone];
        const backgroundHex = colors[backgroundName];

        expect(textHex, `${tone} is missing from the stylesheet`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(backgroundHex, `${backgroundName} is missing from the stylesheet`).toMatch(
          /^#[0-9a-f]{6}$/i,
        );
        expect(contrastRatio(textHex as string, backgroundHex as string)).toBeGreaterThanOrEqual(
          textTones[tone],
        );
      });
    }
  }
});

// A disabled nav button composites its label onto the page behind it, not onto its own faded
// background, so the check mirrors that compositing instead of comparing two opaque tokens. The
// alpha is read from the stylesheet's own disabled-strong opacity so this can't drift out of sync
// with it.
describe("pagination dimmed nav button text contrast", () => {
  const opacityMatch = stylesheet.match(/--opacity-disabled-strong:\s*([\d.]+)%\s*;/);

  it("declares the disabled-strong opacity the nav buttons use", () => {
    expect(opacityMatch, "no --opacity-disabled-strong token found").not.toBeNull();
  });

  const alpha = Number.parseFloat(opacityMatch?.[1] ?? "0") / 100;

  for (const backgroundName of ["white", "bone"] as const) {
    it(`text at that opacity reaches ${AA_TEXT_CONTRAST}:1 against ${backgroundName}`, () => {
      const textRgb = hexToRgb(colors["text"] as string);
      const background = hexToRgb(backgrounds[backgroundName] as string);
      const channel = (fg: number, bg: number) =>
        Math.round(fg * alpha + bg * (1 - alpha))
          .toString(16)
          .padStart(2, "0");
      const compositedHex = `#${channel(textRgb.r, background.r)}${channel(textRgb.g, background.g)}${channel(textRgb.b, background.b)}`;

      expect(
        contrastRatio(compositedHex, backgrounds[backgroundName] as string),
      ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    });
  }
});
