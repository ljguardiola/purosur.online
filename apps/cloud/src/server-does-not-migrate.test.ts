import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("server startup", () => {
  it("never imports the migrate module", () => {
    const source = readFileSync(new URL("./server.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/["']\.\/migrate\.js["']/);
  });
});
