import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { describe, expect, it } from "vitest";

const stylesheetPath = fileURLToPath(new URL("./tokens.css", import.meta.url));
const stylesheet = readFileSync(stylesheetPath, "utf-8");
const designSystem = await __unstable__loadDesignSystem(stylesheet, {
  base: dirname(stylesheetPath),
});

function compile(candidate: string): string | null {
  return designSystem.candidatesToCss([candidate])[0] ?? null;
}

const themeTokens = [...designSystem.theme.entries()].map(([name]) => name);

describe("the theme", () => {
  it("holds only the tokens this stylesheet declares", () => {
    const undeclared = themeTokens.filter((name) => !stylesheet.includes(`${name}:`));

    expect(undeclared).toEqual([]);
  });

  it.each([
    "bg-red-500",
    "text-white",
    "text-sm",
    "text-base",
    "font-medium",
    "font-light",
    "shadow-2xl",
    "rounded-2xl",
    "max-w-md",
    "tracking-widest",
    "leading-tight",
    "blur-sm",
    "ease-in-out",
    "md:flex",
    "animate-bounce",
  ])("compiles no utility from Tailwind's default theme: %s", (candidate) => {
    expect(compile(candidate)).toBeNull();
  });
});

const utilityForToken: Array<{ prefix: string; utility: (name: string) => string }> = [
  { prefix: "--color-", utility: (name) => `bg-${name}` },
  { prefix: "--text-", utility: (name) => `text-${name}` },
  { prefix: "--font-weight-", utility: (name) => `font-${name}` },
  { prefix: "--radius-", utility: (name) => `rounded-${name}` },
  { prefix: "--shadow-", utility: (name) => `shadow-${name}` },
  { prefix: "--inset-shadow-", utility: (name) => `inset-shadow-${name}` },
  { prefix: "--leading-", utility: (name) => `leading-${name}` },
  { prefix: "--tracking-", utility: (name) => `tracking-${name}` },
  { prefix: "--z-index-", utility: (name) => `z-${name}` },
  { prefix: "--opacity-", utility: (name) => `opacity-${name}` },
  { prefix: "--spacing-control-", utility: (name) => `h-control-${name}` },
  { prefix: "--spacing-icon-", utility: (name) => `size-icon-${name}` },
  { prefix: "--transition-property-", utility: (name) => `transition-${name}` },
  { prefix: "--animate-", utility: (name) => `animate-${name}` },
];

describe("every token", () => {
  it("has a utility that compiles", () => {
    const dead: string[] = [];
    for (const token of themeTokens) {
      const rule = utilityForToken.find(({ prefix }) => token.startsWith(prefix));
      if (rule === undefined || token.includes("--", rule.prefix.length)) {
        continue;
      }
      const candidate = rule.utility(token.slice(rule.prefix.length));
      if (compile(candidate) === null) {
        dead.push(`${token} -> ${candidate}`);
      }
    }

    expect(dead).toEqual([]);
  });
});

describe("foundation utilities", () => {
  it.each([
    "text-body",
    "font-bold",
    "font-sans",
    "font-mono",
    "rounded-lg",
    "rounded-full",
    "shadow-lg",
    "inset-ring-2",
    "inset-ring-border",
    "inset-ring-0",
    "z-popover",
    "opacity-disabled",
    "h-control-md",
    "size-icon-md",
    "leading-xs",
    "tracking-xs",
    "transition-background",
    "transition-colors",
    "animate-spin",
    "focus-ring",
    "focus-ring-tight",
    "focus-ring-inset",
    "focus-ring-inverse",
    "data-focus-visible:focus-ring",
    "w-105",
  ])("compiles %s", (candidate) => {
    expect(compile(candidate)).not.toBeNull();
  });

  it.each([
    ["w-trigger", "width: var(--trigger-width)"],
    ["min-w-trigger", "min-width: var(--trigger-width)"],
  ])("sizes %s from the popover trigger's width", (candidate, declaration) => {
    expect(compile(candidate) ?? "").toContain(declaration);
  });

  it("gives a text style its size, line height and weight together", () => {
    const rule = compile("text-body") ?? "";

    expect(rule).toContain("font-size: var(--text-body)");
    expect(rule).toContain("line-height: var(--tw-leading, var(--text-body--line-height))");
    expect(rule).toContain("font-weight: var(--tw-font-weight, var(--text-body--font-weight))");
  });

  it.each([
    ["focus-ring", "var(--focus-ring-offset)", "var(--color-focus)"],
    ["focus-ring-tight", "var(--focus-ring-offset-tight)", "var(--color-focus)"],
    ["focus-ring-inset", "var(--focus-ring-offset-inset)", "var(--color-focus)"],
    ["focus-ring-inverse", "var(--focus-ring-offset-tight)", "var(--color-focus-inverse)"],
  ])("draws %s as a solid outline of the ring width", (candidate, offset, color) => {
    const rule = compile(candidate) ?? "";

    expect(rule).toContain("outline-style: solid");
    expect(rule).toContain("outline-width: var(--focus-ring-width)");
    expect(rule).toContain(`outline-color: ${color}`);
    expect(rule).toContain(`outline-offset: ${offset}`);
  });
});
