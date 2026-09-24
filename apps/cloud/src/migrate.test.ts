import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, inject, it, vi } from "vitest";
import {
  isRetryableConnectionError,
  probeConnectTimeoutSeconds,
  runMigrations,
  waitForDatabase,
} from "./migrate.js";

describe("runMigrations", () => {
  it("rejects when the database is unreachable", async () => {
    await expect(
      runMigrations("postgres://user:pass@127.0.0.1:1/nonexistent", "unused-unreachable-database", {
        migrationsFolder: new URL("../migrations", import.meta.url).pathname,
        connectTimeoutSeconds: 1,
        // A zero wait budget keeps this test fast: it proves an unreachable database still
        // fails the deploy, not that the retry loop is bounded (the waitForDatabase tests cover that).
        waitForDatabaseSeconds: 0,
      }),
    ).rejects.toThrow();
  });

  it("keeps retrying an unreachable database until the wait budget runs out", async () => {
    const onWaiting = vi.fn();

    await expect(
      runMigrations("postgres://user:pass@127.0.0.1:1/nonexistent", "unused-unreachable-database", {
        migrationsFolder: new URL("../migrations", import.meta.url).pathname,
        connectTimeoutSeconds: 1,
        waitForDatabaseSeconds: 1,
        waitIntervalMs: 100,
        onWaiting,
      }),
    ).rejects.toMatchObject({ code: "ECONNREFUSED" });

    expect(onWaiting.mock.calls.length).toBeGreaterThan(1);
  });

  it("probes on the wait interval without the driver's reconnect backoff piling up", async () => {
    const clock = fakeClock();
    const onWaiting = vi.fn();

    await expect(
      runMigrations("postgres://user:pass@127.0.0.1:1/nonexistent", "unused-unreachable-database", {
        migrationsFolder: new URL("../migrations", import.meta.url).pathname,
        connectTimeoutSeconds: 1,
        waitForDatabaseSeconds: 30,
        waitIntervalMs: 1000,
        sleep: clock.sleep,
        now: clock.now,
        onWaiting,
      }),
    ).rejects.toMatchObject({ code: "ECONNREFUSED" });

    expect(onWaiting).toHaveBeenCalledTimes(30);
  });

  it("ignores MIGRATE_DATABASE_WAIT_SECONDS when choosing how long to wait", async () => {
    vi.stubEnv("MIGRATE_DATABASE_WAIT_SECONDS", "0");
    const clock = fakeClock();
    const onWaiting = vi.fn();

    try {
      await expect(
        runMigrations(
          "postgres://user:pass@127.0.0.1:1/nonexistent",
          "unused-unreachable-database",
          {
            migrationsFolder: new URL("../migrations", import.meta.url).pathname,
            connectTimeoutSeconds: 1,
            sleep: clock.sleep,
            now: clock.now,
            onWaiting,
          },
        ),
      ).rejects.toMatchObject({ code: "ECONNREFUSED" });
    } finally {
      vi.unstubAllEnvs();
    }

    expect(onWaiting).toHaveBeenCalled();
  });
});

function envWithout(...names: string[]): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of names) {
    delete env[name];
  }
  return env;
}

describe("the migrate command", () => {
  it("does not print the database URL when it fails on a malformed one", () => {
    const result = spawnSync(process.execPath, [join(inject("cloudBuildDir"), "migrate.js")], {
      env: {
        ...envWithout("DATABASE_URL", "CLOUD_APP_DATABASE_PASSWORD"),
        DATABASE_URL: "postgres://user:s3cret-password@[bad/db",
        CLOUD_APP_DATABASE_PASSWORD: "unused-malformed-url-test",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ERR_INVALID_URL");
    expect(`${result.stdout}${result.stderr}`).not.toContain("s3cret-password");
  });

  it("fails with a clear message when DATABASE_URL is not set", () => {
    const result = spawnSync(process.execPath, [join(inject("cloudBuildDir"), "migrate.js")], {
      env: envWithout("DATABASE_URL", "CLOUD_APP_DATABASE_PASSWORD"),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("migrate: DATABASE_URL is not set");
  });

  it("fails with a clear message when CLOUD_APP_DATABASE_PASSWORD is not set", () => {
    const result = spawnSync(process.execPath, [join(inject("cloudBuildDir"), "migrate.js")], {
      env: {
        ...envWithout("DATABASE_URL", "CLOUD_APP_DATABASE_PASSWORD"),
        DATABASE_URL: "postgres://user:pass@127.0.0.1:1/nonexistent",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("migrate: CLOUD_APP_DATABASE_PASSWORD is not set");
  });
});

describe("probeConnectTimeoutSeconds", () => {
  it("uses the configured connect timeout while the budget has more time left", () => {
    expect(probeConnectTimeoutSeconds(30_000, 10)).toBe(10);
  });

  it("shortens the connect timeout to the time left in the budget", () => {
    expect(probeConnectTimeoutSeconds(2_500, 10)).toBe(2.5);
  });

  it("never returns zero, which the driver reads as no timeout at all", () => {
    expect(probeConnectTimeoutSeconds(0, 10)).toBeGreaterThan(0);
  });
});

function fakeClock(startMs = 0) {
  let current = startMs;
  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
    },
  };
}

describe("waitForDatabase", () => {
  it("resolves without waiting when the probe already succeeds", async () => {
    const clock = fakeClock();
    const sleep = vi.fn(clock.sleep);
    const probe = vi.fn(async () => {});

    await waitForDatabase(probe, { budgetSeconds: 10, intervalMs: 500, sleep, now: clock.now });

    expect(probe).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a retryable connection error until the probe succeeds", async () => {
    const clock = fakeClock();
    let attempts = 0;
    const probe = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
      }
    });

    await waitForDatabase(probe, {
      budgetSeconds: 10,
      intervalMs: 500,
      sleep: clock.sleep,
      now: clock.now,
    });

    expect(probe).toHaveBeenCalledTimes(3);
  });

  it("rejects with the last connection error once the wait budget is exhausted", async () => {
    const clock = fakeClock();
    const error = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    const probe = vi.fn(async () => {
      throw error;
    });

    await expect(
      waitForDatabase(probe, {
        budgetSeconds: 2,
        intervalMs: 1000,
        sleep: clock.sleep,
        now: clock.now,
      }),
    ).rejects.toBe(error);

    expect(probe.mock.calls.length).toBeGreaterThan(1);
  });

  it("passes each probe the time left in the budget", async () => {
    const clock = fakeClock();
    const remaining: number[] = [];
    const probe = vi.fn(async (remainingMs: number) => {
      remaining.push(remainingMs);
      throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    });

    await expect(
      waitForDatabase(probe, {
        budgetSeconds: 2,
        intervalMs: 1000,
        sleep: clock.sleep,
        now: clock.now,
      }),
    ).rejects.toMatchObject({ code: "ECONNREFUSED" });

    expect(remaining).toEqual([2000, 1000, 0]);
  });

  it("does not run past the budget when each failing probe takes time", async () => {
    const clock = fakeClock();
    const probe = vi.fn(async (remainingMs: number) => {
      await clock.sleep(Math.min(700, remainingMs));
      throw Object.assign(new Error("connect timeout"), { code: "CONNECT_TIMEOUT" });
    });

    await expect(
      waitForDatabase(probe, {
        budgetSeconds: 5,
        intervalMs: 1000,
        sleep: clock.sleep,
        now: clock.now,
      }),
    ).rejects.toMatchObject({ code: "CONNECT_TIMEOUT" });

    expect(clock.now()).toBeLessThanOrEqual(5000);
  });

  it("does not retry an error that is not a connection failure", async () => {
    const clock = fakeClock();
    const sleep = vi.fn(clock.sleep);
    const error = Object.assign(new Error("password authentication failed"), { code: "28P01" });
    const probe = vi.fn(async () => {
      throw error;
    });

    await expect(
      waitForDatabase(probe, { budgetSeconds: 10, intervalMs: 500, sleep, now: clock.now }),
    ).rejects.toBe(error);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("calls onWaiting with the error and the elapsed time before each retry", async () => {
    const clock = fakeClock();
    let attempts = 0;
    const probe = vi.fn(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
      }
    });
    const onWaiting = vi.fn();

    await waitForDatabase(probe, {
      budgetSeconds: 10,
      intervalMs: 500,
      sleep: clock.sleep,
      now: clock.now,
      onWaiting,
    });

    expect(onWaiting).toHaveBeenCalledTimes(1);
    expect(onWaiting).toHaveBeenCalledWith(expect.objectContaining({ code: "ECONNREFUSED" }), 0);
  });
});

describe("isRetryableConnectionError", () => {
  it.each([
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "ECONNRESET",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ECONNABORTED",
    "CONNECT_TIMEOUT",
    "CONNECTION_CLOSED",
    "57P03",
  ])("treats %s as a retryable connection failure", (code) => {
    expect(isRetryableConnectionError(Object.assign(new Error("x"), { code }))).toBe(true);
  });

  it.each([
    "28P01", // invalid_password
    "3D000", // invalid_catalog_name (unknown database)
    "42601", // syntax_error, e.g. a bad migration statement
    "CONNECTION_ENDED", // the client was already ended, which no amount of waiting undoes
  ])("does not treat %s as a retryable connection failure", (code) => {
    expect(isRetryableConnectionError(Object.assign(new Error("x"), { code }))).toBe(false);
  });

  it("does not treat an error without a code as retryable", () => {
    expect(isRetryableConnectionError(new Error("boom"))).toBe(false);
  });

  it("does not treat a non-error value as retryable", () => {
    expect(isRetryableConnectionError("boom")).toBe(false);
  });
});
