import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE_DIR = new URL("../", import.meta.url);

function integrationTestsStartingTheServer(): string[] {
  return readdirSync(SOURCE_DIR, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".integration.test.ts"))
    .filter((path) => readFileSync(new URL(path, SOURCE_DIR), "utf8").includes("startServer("));
}

describe("integration tests that start the real server", () => {
  it("find at least the recovery ones", () => {
    expect(integrationTestsStartingTheServer()).toEqual(
      expect.arrayContaining([
        "access/recovery-redemption-concurrency.integration.test.ts",
        "access/recovery-request-wiring.integration.test.ts",
      ]),
    );
  });

  it.each(integrationTestsStartingTheServer())(
    "%s points every ARCA endpoint at an unreachable local address",
    (path) => {
      const source = readFileSync(new URL(path, SOURCE_DIR), "utf8");

      expect(source).toContain("arcaEndpoints: unreachableArcaEndpoints");
    },
  );
});
