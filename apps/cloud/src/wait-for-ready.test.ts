import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, inject, it, vi } from "vitest";
import { isNotMigratedYetError, waitForReady } from "./wait-for-ready.js";

function envWithout(...names: string[]): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of names) {
    delete env[name];
  }
  return env;
}

describe("the wait-for-ready command", () => {
  it("fails with a clear message when DATABASE_URL is not set", () => {
    const result = spawnSync(
      process.execPath,
      [join(inject("cloudBuildDir"), "wait-for-ready.js")],
      {
        env: envWithout("DATABASE_URL"),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("wait-for-ready: DATABASE_URL is not set");
  });

  it("does not print the database URL when it fails on a malformed one", () => {
    const result = spawnSync(
      process.execPath,
      [join(inject("cloudBuildDir"), "wait-for-ready.js")],
      {
        env: {
          ...envWithout("DATABASE_URL"),
          DATABASE_URL: "postgres://user:s3cret-password@[bad/db",
        },
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain("s3cret-password");
  });
});

describe("waitForReady", () => {
  it("waits eight minutes by default before giving up on a database that never becomes ready", async () => {
    let current = 0;
    const onWaiting = vi.fn();

    await expect(
      waitForReady("postgres://cloud_app:pass@127.0.0.1:1/nonexistent", {
        connectTimeoutSeconds: 1,
        // Every probe opens a real socket, so a wide interval keeps the probe count low.
        waitIntervalMs: 60_000,
        sleep: async (ms) => {
          current += ms;
        },
        now: () => current,
        onWaiting,
      }),
    ).rejects.toMatchObject({ code: "ECONNREFUSED" });

    expect(current).toBe(480_000);
  });
});

describe("isNotMigratedYetError", () => {
  it.each([
    "28000", // invalid_authorization_specification, e.g. the role does not exist yet
    "28P01", // invalid_password, e.g. its password is not set yet
    "3F000", // invalid_schema_name, e.g. the drizzle or graphile_worker schema is not there yet
    "42P01", // undefined_table, e.g. a bundled migration has not created its table yet
    "42501", // insufficient_privilege, e.g. this database has no grants yet for cloud_app
  ])("treats %s as not migrated yet", (code) => {
    expect(isNotMigratedYetError(Object.assign(new Error("x"), { code }))).toBe(true);
  });

  it.each([
    "42601", // syntax_error, a bug in wait-for-ready's own query, never "not ready yet"
    "23505", // unique_violation, unrelated to schema readiness
  ])("does not treat %s as not migrated yet", (code) => {
    expect(isNotMigratedYetError(Object.assign(new Error("x"), { code }))).toBe(false);
  });

  it("does not treat an error without a code as not migrated yet", () => {
    expect(isNotMigratedYetError(new Error("boom"))).toBe(false);
  });

  it("does not treat a non-error value as not migrated yet", () => {
    expect(isNotMigratedYetError("boom")).toBe(false);
  });
});
