import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf-8");

const roles = [
  "text",
  "surface",
  "border",
  "action",
  "focus",
  "info",
  "success",
  "warning",
  "error",
  "neutral",
  "data",
  "backdrop",
];
const variants = ["inverse", "accent", "eyebrow", "nav"];
const steps = ["subtle", "soft", "strong"];

function declarations(prefix: string): Array<{ name: string; value: string }> {
  return [...stylesheet.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+):\\s*([^;]+);`, "g"))].map(
    ([, name, value]) => ({ name: name ?? "", value: (value ?? "").trim() }),
  );
}

const colorTokens = declarations("color");
const paletteEntries = declarations("palette");

describe("color role tokens", () => {
  it("declares role tokens", () => {
    expect(colorTokens.length).toBeGreaterThan(0);
  });

  it("names every color <role>[-<variant>][-<step>] from the closed lists", () => {
    const rule = new RegExp(
      `^(?:${roles.join("|")})(?:-(?:${variants.join("|")}))?(?:-(?:${steps.join("|")}))?$`,
    );
    const misnamed = colorTokens.map(({ name }) => name).filter((name) => !rule.test(name));

    expect(misnamed).toEqual([]);
  });

  it("defines every color as a reference to a palette entry", () => {
    const paletteNames = new Set(paletteEntries.map(({ name }) => name));
    const notReferences = colorTokens
      .filter(({ value }) => {
        const reference = value.match(/^var\(--palette-([a-z0-9-]+)\)$/)?.[1];
        return reference === undefined || !paletteNames.has(reference);
      })
      .map(({ name }) => name);

    expect(notReferences).toEqual([]);
  });

  it("declares each color once", () => {
    const names = colorTokens.map(({ name }) => name);

    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });
});

describe("palette", () => {
  it("declares entries", () => {
    expect(paletteEntries.length).toBeGreaterThan(0);
  });

  it("holds only hex colors", () => {
    const notHex = paletteEntries
      .filter(({ value }) => !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value))
      .map(({ name }) => name);

    expect(notHex).toEqual([]);
  });

  it("names each entry <hue>-<step>, with an optional a<percent> alpha suffix", () => {
    const misnamed = paletteEntries
      .map(({ name }) => name)
      .filter((name) => !/^[a-z]+(?:-\d{2,3})?(?:-a\d{1,3})?$/.test(name));

    expect(misnamed).toEqual([]);
  });
});

const tShirtSteps = [
  "3xs",
  "2xs",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
];

const PIXELS_PER_REM = 16;

function pixels(value: string): number {
  const match = value.match(/^(-?[\d.]+)(px|rem)$/);
  if (match === null) {
    throw new Error(`Not a length: ${value}`);
  }
  const amount = Number.parseFloat(match[1] ?? "");
  return match[2] === "px" ? amount : amount * PIXELS_PER_REM;
}

function blur(shadow: string): number {
  const lengths = shadow.match(/-?[\d.]+px/g) ?? [];
  return Number.parseFloat(lengths[1] ?? "");
}

function expectTShirtScaleOrderedByValue(prefix: string, measure: (value: string) => number): void {
  const entries = declarations(prefix);
  const stepIndexes = entries.map(({ name }) => tShirtSteps.indexOf(name));
  const measures = entries.map(({ value }) => measure(value));

  expect(entries.length).toBeGreaterThan(0);
  expect(entries.map(({ name }) => name).filter((_, index) => stepIndexes[index] === -1)).toEqual(
    [],
  );
  expect(stepIndexes).toEqual([...stepIndexes].sort((a, b) => a - b));
  expect(new Set(stepIndexes).size).toBe(stepIndexes.length);
  expect(measures).toEqual([...measures].sort((a, b) => a - b));
  expect(new Set(measures).size).toBe(measures.length);
}

describe("scales", () => {
  it.each([
    ["radius", pixels],
    ["shadow", blur],
    ["leading", Number.parseFloat],
    ["tracking", pixels],
    ["spacing-control", pixels],
    ["spacing-icon", pixels],
  ] as const)(
    "names every --%s step from the t-shirt sizes, ordered by value",
    (prefix, measure) => {
      expectTShirtScaleOrderedByValue(prefix, measure);
    },
  );

  it("gives the elevation scale one step per drop shadow and no other kind of shadow", () => {
    expect(declarations("shadow").map(({ name }) => name)).toEqual(["sm", "md", "lg", "xl"]);
  });
});

describe("font weights", () => {
  it("names the weights normal, semibold and bold by ascending value", () => {
    expect(declarations("font-weight")).toEqual([
      { name: "normal", value: "400" },
      { name: "semibold", value: "600" },
      { name: "bold", value: "700" },
    ]);
  });
});

describe("text styles", () => {
  const textStyleRoles = ["display", "title", "heading", "subheading", "body", "detail", "caption"];
  const sizes = [...stylesheet.matchAll(/--text-([a-z]+):\s*([^;]+);/g)].map(([, name, value]) => ({
    name: name ?? "",
    value: (value ?? "").trim(),
  }));

  it("names every text style by role", () => {
    expect(sizes.map(({ name }) => name)).toEqual(textStyleRoles);
  });

  it("orders the styles from largest to smallest size", () => {
    const rems = sizes.map(({ value }) => pixels(value));

    expect(rems).toEqual([...rems].sort((a, b) => b - a));
  });

  it("gives each style its own line height and font weight", () => {
    const withLineHeight = declarations("text").filter(({ name }) =>
      name.endsWith("--line-height"),
    );
    const withFontWeight = declarations("text").filter(({ name }) =>
      name.endsWith("--font-weight"),
    );

    expect(withLineHeight.map(({ name }) => name.replace("--line-height", ""))).toEqual(
      textStyleRoles,
    );
    expect(withFontWeight.map(({ name }) => name.replace("--font-weight", ""))).toEqual(
      textStyleRoles,
    );
  });
});

describe("stacking order", () => {
  it("names the layers from lowest to highest", () => {
    const layers = declarations("z-index");

    expect(layers.map(({ name }) => name)).toEqual(["raised", "focused", "overlay", "popover"]);
    const values = layers.map(({ value }) => Number.parseInt(value, 10));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});

describe("disabled look", () => {
  it("has a regular and a stronger opacity, the stronger one more opaque", () => {
    const [regular, strong] = declarations("opacity");

    expect(regular?.name).toBe("disabled");
    expect(strong?.name).toBe("disabled-strong");
    expect(Number.parseFloat(strong?.value ?? "")).toBeGreaterThan(
      Number.parseFloat(regular?.value ?? ""),
    );
  });
});
