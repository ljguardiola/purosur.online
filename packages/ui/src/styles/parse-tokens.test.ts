import { describe, expect, it } from "vitest";
import { parseColorTokens } from "./parse-tokens";

describe("parseColorTokens", () => {
  it("reads every color token declared inside the @theme block", () => {
    const css = `
      @theme {
        --color-surface: #ffffff;
        --color-action: #4f6c7e;
      }
    `;

    expect(parseColorTokens(css)).toEqual({
      surface: "#ffffff",
      action: "#4f6c7e",
    });
  });

  it("keeps tokens declared after a nested block whose own closing brace starts a line", () => {
    const css = [
      "@theme {",
      "  --color-surface: #ffffff;",
      "  @media (prefers-color-scheme: dark) {",
      "  --radius-lg: 1rem;",
      "}",
      "  --color-action: #4f6c7e;",
      "}",
    ].join("\n");

    expect(parseColorTokens(css)).toEqual({
      surface: "#ffffff",
      action: "#4f6c7e",
    });
  });

  it("returns no tokens when the stylesheet has no @theme block", () => {
    expect(parseColorTokens("body { color: red; }")).toEqual({});
  });

  it("throws when an @theme block is never closed", () => {
    const css = "@theme {\n  --color-surface: #ffffff;\n";

    expect(() => parseColorTokens(css)).toThrow();
  });

  it("reads tokens from every @theme block, not just the first", () => {
    const css = [
      "@theme {",
      "  --color-surface: #ffffff;",
      "}",
      "@theme {",
      "  --color-action: #4f6c7e;",
      "}",
    ].join("\n");

    expect(parseColorTokens(css)).toEqual({
      surface: "#ffffff",
      action: "#4f6c7e",
    });
  });

  it("reads an 8-digit hex color token that carries an alpha channel", () => {
    const css = `
      @theme {
        --color-surface: #ffffff;
        --color-backdrop: #1a1a1a1f;
      }
    `;

    expect(parseColorTokens(css)).toEqual({
      surface: "#ffffff",
      backdrop: "#1a1a1a1f",
    });
  });

  it("ignores an @theme mention inside a CSS comment", () => {
    const css = [
      "/* @theme { --color-surface: #000000; } */",
      "@theme {",
      "  --color-action: #4f6c7e;",
      "}",
    ].join("\n");

    expect(parseColorTokens(css)).toEqual({
      action: "#4f6c7e",
    });
  });

  it("resolves a role token defined as a palette reference to the palette's color", () => {
    const css = `
      :root {
        --palette-blue-600: #4f6c7e;
        --palette-neutral-900-a12: #1a1a1a1f;
      }
      @theme static {
        --color-action: var(--palette-blue-600);
        --color-backdrop: var(--palette-neutral-900-a12);
      }
    `;

    expect(parseColorTokens(css)).toEqual({
      action: "#4f6c7e",
      backdrop: "#1a1a1a1f",
    });
  });

  it("finds the palette wherever the stylesheet declares it, even after the theme block", () => {
    const css = [
      "@theme {",
      "  --color-action: var(--palette-blue-600);",
      "}",
      "@layer theme {",
      "  :root {",
      "    --palette-blue-600: #4f6c7e;",
      "  }",
      "}",
    ].join("\n");

    expect(parseColorTokens(css)).toEqual({ action: "#4f6c7e" });
  });

  it("does not list palette entries as color tokens", () => {
    const css = ":root { --palette-blue-600: #4f6c7e; }";

    expect(parseColorTokens(css)).toEqual({});
  });

  it("throws when a role token references a palette entry that does not exist", () => {
    const css = [
      ":root { --palette-blue-600: #4f6c7e; }",
      "@theme {",
      "  --color-action: var(--palette-blue-700);",
      "}",
    ].join("\n");

    expect(() => parseColorTokens(css)).toThrow(/palette-blue-700/);
  });
});
