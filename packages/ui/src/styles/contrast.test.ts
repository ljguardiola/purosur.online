import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AA_TEXT_CONTRAST,
  AAA_TEXT_CONTRAST,
  contrastRatio,
  hexToRgb,
  NON_TEXT_CONTRAST,
} from "./contrast";
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
// blue-soft, see tokens.css), the plain/accent/message-background shades that are only ever
// used as small decorative fills, never as text or icon color, and the alpha shadow tint (never
// text, and outside contrastRatio()'s opaque 6-digit-hex contract).
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
  "ink-shadow",
  "ink-backdrop",
  "ink-panel-shadow",
  "brand-blue-ui-shadow",
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

// Shared by the status indicator and the notice family: each paints a tone's text (and, for the
// notices, its icon) on that same tone's own message background, a pairing none of the shared
// white/bone/sand surfaces above cover. Reused here instead of duplicated per component.
const toneOnMessageBackgroundPairs: Record<string, { text: string; background: string }> = {
  success: { text: "brand-green-strong", background: "brand-green-message-bg" },
  warning: { text: "status-warning-strong", background: "status-warning-message-bg" },
  error: { text: "status-error-strong", background: "status-error-message-bg" },
  info: { text: "brand-blue-strong", background: "brand-blue-message-bg" },
  neutral: { text: "ink-secondary", background: "surface-sand" },
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

// The option card's own three backgrounds: white and bone are already covered by the text-tone
// suite above (ink and ink-secondary reach their threshold against every surface), and its chosen
// background is the same as the "info" pair above (brand-blue-strong on brand-blue-message-bg).
// The one combination neither of those cover is the help text's ink-secondary on that same chosen
// background, since it's the only tone painted on brand-blue-message-bg that isn't brand-blue-strong.
describe("option card help text on its chosen background contrast", () => {
  it(`ink-secondary reaches ${AAA_TEXT_CONTRAST}:1 against brand-blue-message-bg`, () => {
    const textHex = colors["ink-secondary"];
    const backgroundHex = colors["brand-blue-message-bg"];

    expect(textHex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(backgroundHex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrastRatio(textHex as string, backgroundHex as string)).toBeGreaterThanOrEqual(
      AAA_TEXT_CONTRAST,
    );
  });
});

// The text-tone suite above already covers this exact pair, since it checks ink against the white
// surface, but only at AA, the threshold ink is listed with there. The tooltip is held to AAA, so
// what is missing is the threshold, not the pairing: contrastRatio ignores which of the two colors
// is the background (the suite at the top of this file proves it), so ink read as text on white
// and surface-white read as text on ink are the same ratio. surface-white stays in decorativeTones
// for that same reason — clearing AAA against ink says nothing about it as a text tone.
describe("tooltip text on ink background contrast", () => {
  it(`surface-white reaches ${AAA_TEXT_CONTRAST}:1 against ink`, () => {
    const textHex = colors["surface-white"];
    const backgroundHex = colors.ink;

    expect(textHex, "surface-white is missing from the stylesheet").toMatch(/^#[0-9a-f]{6}$/i);
    expect(backgroundHex, "ink is missing from the stylesheet").toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrastRatio(textHex as string, backgroundHex as string)).toBeGreaterThanOrEqual(
      AAA_TEXT_CONTRAST,
    );
  });
});

describe("brand-blue-ui-shadow token", () => {
  it("parses to brand-blue-ui at 20% alpha", () => {
    const shadowHex = colors["brand-blue-ui-shadow"];
    const uiHex = colors["brand-blue-ui"];

    expect(shadowHex, "brand-blue-ui-shadow is missing from the stylesheet").toMatch(
      /^#[0-9a-f]{8}$/i,
    );
    expect(uiHex, "brand-blue-ui is missing from the stylesheet").toMatch(/^#[0-9a-f]{6}$/i);
    expect((shadowHex as string).slice(0, 7).toLowerCase()).toBe((uiHex as string).toLowerCase());

    const alpha = Number.parseInt((shadowHex as string).slice(7, 9), 16) / 255;
    expect(alpha).toBeCloseTo(0.2, 2);
  });
});

// The text field's own resting, hovered and read-only border reuses the shared ink-secondary
// boundary — whose contrast against these same white and bone fills is checked, against a real
// rendered element, in RadioGroup.test.tsx and Toggle.test.tsx — instead of the softer,
// decorative "line"/"blue-soft" tokens, which fall short of the WCAG 3:1 non-text contrast
// minimum (line measures ~1.49:1 on white, blue-soft ~1.47:1) and stay reserved for dividers and
// container edges, never a control's own boundary. Its focused and invalid borders are unique to
// the field, so those are the two checked here, against both surfaces the field can sit on
// (white, and bone for a hovered or read-only field).
describe("text field border contrast", () => {
  const borders: Record<string, string> = {
    "focused (brand-blue-strong)": "brand-blue-strong",
    "invalid (status-error-ui)": "status-error-ui",
  };

  for (const [state, tone] of Object.entries(borders)) {
    it(`${state} border reaches ${NON_TEXT_CONTRAST}:1 against white and bone`, () => {
      const borderHex = colors[tone];

      expect(borderHex, `${tone} is missing from the stylesheet`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(
        contrastRatio(borderHex as string, backgrounds.white as string),
      ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
      expect(contrastRatio(borderHex as string, backgrounds.bone as string)).toBeGreaterThanOrEqual(
        NON_TEXT_CONTRAST,
      );
    });
  }
});
