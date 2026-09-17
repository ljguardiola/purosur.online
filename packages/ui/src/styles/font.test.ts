import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesheetPath = fileURLToPath(new URL("./tokens.css", import.meta.url));
const stylesheet = readFileSync(stylesheetPath, "utf-8");

describe("system font", () => {
  it("imports Atkinson Hyperlegible Next from the bundled package, not a CDN", () => {
    expect(stylesheet).toContain('@import "@fontsource-variable/atkinson-hyperlegible-next"');
    expect(stylesheet).not.toMatch(/https?:\/\//);
  });

  it("exposes the font through the --font-sans token", () => {
    expect(stylesheet).toMatch(/--font-sans:\s*"Atkinson Hyperlegible Next Variable"/);
  });
});
