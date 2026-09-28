import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readSibling(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");
}

describe("public API", () => {
  it("exposes the stylesheet through the package name", () => {
    const manifest = JSON.parse(readSibling("../package.json")) as {
      exports: Record<string, string>;
    };

    expect(manifest.exports["./tokens.css"]).toBe("./src/styles/tokens.css");
  });

  it("exports no class strings from the entry", () => {
    expect(readSibling("./index.ts")).not.toMatch(/\w+ClassName\b/);
  });
});
