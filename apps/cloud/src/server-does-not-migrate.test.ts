import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Migrations run as a pre-deploy command (migrate.ts), never at application startup: a migration
// failure must stop the deploy before the new version ever takes traffic, not crash a running
// server mid-request. This is a structural check, in the spirit of the repo's dependency-cruiser
// rules, that server.ts never reaches for migrate.ts.
describe("server startup", () => {
  it("never imports the migrate module", () => {
    const source = readFileSync(new URL("./server.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/["']\.\/migrate\.js["']/);
  });
});
