import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";

describe("the clear-sample-data command", () => {
  const ENTRYPOINT = join(inject("cloudBuildDir"), "clear-sample-data.js");
  const NON_LOOPBACK_DATABASE_URL = "postgres://user:s3cret-password@203.0.113.5:5432/db";

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

  it("refuses to run against production, without ever contacting the database", () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
      env: {
        ...process.env,
        RAILWAY_ENVIRONMENT_NAME: "production",
        DATABASE_URL: NON_LOOPBACK_DATABASE_URL,
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("clear-sample-data: refused");
  });
});
