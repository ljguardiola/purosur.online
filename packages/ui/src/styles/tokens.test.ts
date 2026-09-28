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
