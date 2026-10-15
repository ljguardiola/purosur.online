import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";

describe("the dump-offsite command", { timeout: 0 }, () => {
  it("fails with a clear message when its configuration is missing", () => {
    const result = spawnSync(process.execPath, [join(inject("cloudBuildDir"), "dump-offsite.js")], {
      env: {},
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("offsite-dump: OFFSITE_DUMP_DATABASE_URL");
    expect(result.stderr).toContain("are not set");
  });
});
