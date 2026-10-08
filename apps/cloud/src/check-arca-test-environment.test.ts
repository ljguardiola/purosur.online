import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";
import { VALID_ARCA_CERTIFICATE } from "./test-support/arca-certificate-fixtures.js";

function envWithout(...names: string[]): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of names) {
    delete env[name];
  }
  return env;
}

// The command's process ends on its own once it refuses what it was given, so each test waits
// for it to exit however long the machine takes to load the command.
describe("the check-arca-test-environment command", { timeout: 0 }, () => {
  const ENTRYPOINT = join(inject("cloudBuildDir"), "check-arca-test-environment.js");

  it("fails with a clear message when the certificate is not set", () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
      env: envWithout("ARCA_CERTIFICATE", "ARCA_PRIVATE_KEY"),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("check-arca-test-environment: ARCA_CERTIFICATE is not set");
  });

  it("refuses any argument, without calling the tax authority", () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT, "--environment", "production"], {
      env: { ...process.env, ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE, ARCA_PRIVATE_KEY: "KEY" },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("check-arca-test-environment: accepts no argument");
  });
});
