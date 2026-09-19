import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// packages/ui/src/messages -> repo root.
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const biomeBinary = path.join(repoRoot, "node_modules/.bin/biome");

// Biome's own overrides for the literal-text guard match on the file's path (see biome.json),
// so the samples have to live under a real app's `src/`, not a scratch directory outside it.
// `--stdin-file-path` is not used here: this Biome build (2.5.13) prints no rule diagnostics for
// `lint`/`check` over stdin — the default reporter only ever says "the contents aren't fixed" or
// nothing at all, for every input, fixable or not, and `--reporter=json` is silently ignored in
// that mode too. Real files under `--reporter=json` report every diagnostic's rule category
// reliably, so the guard is exercised that way instead.
const fixturesDir = path.join(repoRoot, "apps/pos/src/__literal-text-guard-fixtures__");

type Diagnostic = { category: string; message: string };

function lintSample(fileName: string, content: string): Diagnostic[] {
  const filePath = path.join(fixturesDir, fileName);
  writeFileSync(filePath, content);

  const relativePath = path.relative(repoRoot, filePath);
  const result = spawnSync(biomeBinary, ["lint", "--reporter=json", relativePath], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  return (JSON.parse(result.stdout) as { diagnostics: Diagnostic[] }).diagnostics;
}

function guardCategories(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.category === "plugin" || diagnostic.category === "lint/style/noJsxLiterals",
  );
}

beforeAll(() => {
  rmSync(fixturesDir, { recursive: true, force: true });
  mkdirSync(fixturesDir, { recursive: true });
});

afterAll(() => {
  rmSync(fixturesDir, { recursive: true, force: true });
});

describe("the literal user-facing text guard", () => {
  it("rejects a plain string written directly as JSX text", () => {
    const diagnostics = lintSample(
      "jsx-text.tsx",
      ["export function Greeting() {", "  return <div>Hola</div>;", "}", ""].join("\n"),
    );

    expect(guardCategories(diagnostics)).toContainEqual(
      expect.objectContaining({ category: "lint/style/noJsxLiterals" }),
    );
  });

  it("rejects a bare string literal given to aria-label", () => {
    const diagnostics = lintSample(
      "aria-label-bare.tsx",
      [
        "export function CloseButton() {",
        '  return <button type="button" aria-label="Cerrar">{"x"}</button>;',
        "}",
        "",
      ].join("\n"),
    );

    expect(guardCategories(diagnostics)).toContainEqual(
      expect.objectContaining({ category: "plugin" }),
    );
  });

  it("rejects a bare string literal given to closeLabel", () => {
    const diagnostics = lintSample(
      "close-label-bare.tsx",
      [
        "export function CloseButton() {",
        '  return <button type="button" closeLabel="Cerrar">{"x"}</button>;',
        "}",
        "",
      ].join("\n"),
    );

    expect(guardCategories(diagnostics)).toContainEqual(
      expect.objectContaining({ category: "plugin" }),
    );
  });

  it("rejects a string literal given to closeLabel inside an expression container", () => {
    const diagnostics = lintSample(
      "close-label-expression.tsx",
      [
        "export function CloseButton() {",
        '  return <button type="button" closeLabel={"Cerrar"}>{"x"}</button>;',
        "}",
        "",
      ].join("\n"),
    );

    expect(guardCategories(diagnostics)).toContainEqual(
      expect.objectContaining({ category: "plugin" }),
    );
  });

  it("accepts a message catalog lookup used as JSX children and as a label attribute", () => {
    const diagnostics = lintSample(
      "catalog-lookup.tsx",
      [
        "export function CloseButton({ messages }: { messages: { close: string } }) {",
        "  return (",
        '    <button type="button" closeLabel={messages.close}>',
        "      {messages.close}",
        "    </button>",
        "  );",
        "}",
        "",
      ].join("\n"),
    );

    expect(guardCategories(diagnostics)).toEqual([]);
  });

  it("accepts a plain string literal given to className", () => {
    const diagnostics = lintSample(
      "class-name.tsx",
      [
        "export function Panel({ children }: { children: string }) {",
        '  return <div className="text-sm">{children}</div>;',
        "}",
        "",
      ].join("\n"),
    );

    expect(guardCategories(diagnostics)).toEqual([]);
  });

  it("does not check a test file's own path", () => {
    const diagnostics = lintSample(
      "exempt.test.tsx",
      [
        "export function Greeting() {",
        '  return <button type="button" aria-label="Cerrar">Hola</button>;',
        "}",
        "",
      ].join("\n"),
    );

    expect(guardCategories(diagnostics)).toEqual([]);
  });
});
