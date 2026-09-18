import { describe, expect, it } from "vitest";
import { parseColorTokens } from "./parse-tokens";

describe("parseColorTokens", () => {
  it("reads every color token declared inside the @theme block", () => {
    const css = `
      @theme {
        --color-surface-white: #ffffff;
        --color-brand-blue-ui: #4f6c7e;
      }
    `;

    expect(parseColorTokens(css)).toEqual({
      "surface-white": "#ffffff",
      "brand-blue-ui": "#4f6c7e",
    });
  });

  it("keeps tokens declared after a nested block whose own closing brace starts a line", () => {
    // This @theme block is balanced, valid CSS: the inner @media block closes before
    // @theme does. A closing brace that merely starts its own line used to be mistaken
    // for the end of @theme itself, silently dropping every token declared after it.
    const css = [
      "@theme {",
      "  --color-surface-white: #ffffff;",
      "  @media (prefers-color-scheme: dark) {",
      "  --radius-lg: 1rem;",
      "}",
      "  --color-brand-blue-ui: #4f6c7e;",
      "}",
    ].join("\n");

    expect(parseColorTokens(css)).toEqual({
      "surface-white": "#ffffff",
      "brand-blue-ui": "#4f6c7e",
    });
  });

  it("returns no tokens when the stylesheet has no @theme block", () => {
    expect(parseColorTokens("body { color: red; }")).toEqual({});
  });

  it("throws when an @theme block is never closed", () => {
    const css = "@theme {\n  --color-surface-white: #ffffff;\n";

    expect(() => parseColorTokens(css)).toThrow();
  });

  it("reads tokens from every @theme block, not just the first", () => {
    const css = [
      "@theme {",
      "  --color-surface-white: #ffffff;",
      "}",
      "@theme {",
      "  --color-brand-blue-ui: #4f6c7e;",
      "}",
    ].join("\n");

    expect(parseColorTokens(css)).toEqual({
      "surface-white": "#ffffff",
      "brand-blue-ui": "#4f6c7e",
    });
  });

  it("reads an 8-digit hex color token that carries an alpha channel", () => {
    const css = `
      @theme {
        --color-surface-white: #ffffff;
        --color-ink-shadow: #1a1a1a1f;
      }
    `;

    expect(parseColorTokens(css)).toEqual({
      "surface-white": "#ffffff",
      "ink-shadow": "#1a1a1a1f",
    });
  });

  it("ignores an @theme mention inside a CSS comment", () => {
    const css = [
      "/* @theme { --color-surface-white: #000000; } */",
      "@theme {",
      "  --color-brand-blue-ui: #4f6c7e;",
      "}",
    ].join("\n");

    expect(parseColorTokens(css)).toEqual({
      "brand-blue-ui": "#4f6c7e",
    });
  });
});
