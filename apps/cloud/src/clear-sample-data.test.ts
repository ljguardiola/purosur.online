import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";

// The command's process ends on its own once it refuses what it was given, so each test waits
// for it to exit however long the machine takes to load the command.
describe("the clear-sample-data command", { timeout: 0 }, () => {
  const ENTRYPOINT = join(inject("cloudBuildDir"), "clear-sample-data.js");
  const NON_LOOPBACK_DATABASE_URL = "postgres://203.0.113.5:5432/db";

  it("refuses to run on staging, without ever contacting the database", () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
      env: {
        ...process.env,
        RAILWAY_ENVIRONMENT_NAME: "staging",
        DATABASE_URL: NON_LOOPBACK_DATABASE_URL,
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("clear-sample-data: refused");
  });
});
