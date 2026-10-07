import { cloudError } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import {
  type CheckInstallationDeps,
  checkInstallation,
  installationCheckResultOf,
} from "./check-installation";
import { SqliteLocalInstallation } from "./sqlite-local-installation";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const CREDENTIALS = { device_id: "a4b1", device_token: "prefix.secret", pepper: "cGVwcGVy" };
const REVOKED_AT = new Date("2026-10-01T09:30:00.000Z");

function register() {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  const replica = new SqliteLocalReplica(database);
  const installation = new SqliteLocalInstallation(database, () => REVOKED_AT);
  const revokedAt = () =>
    database
      .prepare<[], { installation_revoked_at: string | null }>(
        "SELECT installation_revoked_at FROM sync_state",
      )
      .get()?.installation_revoked_at;
  return { replica, installation, revokedAt };
}

function depsFor(
  registerUnderTest: ReturnType<typeof register>,
  answer: CloudResponse,
  overrides: Partial<CheckInstallationDeps> = {},
): CheckInstallationDeps {
  return {
    readCredentials: async () => CREDENTIALS,
    installation: registerUnderTest.installation,
    adoptDevice: (device) => registerUnderTest.replica.adoptDevice(device),
    getFromCloud: async () => answer,
    ...overrides,
  };
}

const answeringRevoked = (revoked: boolean): CloudResponse => ({
  kind: "ok",
  body: { status: "ok", version: "1.0.0", installation: { revoked } },
});

describe("checking this installation with the cloud", () => {
  it("records the installation as revoked when the health check says so", async () => {
    const registerUnderTest = register();

    const attempt = await checkInstallation(depsFor(registerUnderTest, answeringRevoked(true)));

    expect(attempt).toEqual({ kind: "revoked" });
    expect(registerUnderTest.revokedAt()).toBe(REVOKED_AT.toISOString());
  });

  it("keeps knowing it was revoked when a later health check says otherwise", async () => {
    const registerUnderTest = register();
    await checkInstallation(depsFor(registerUnderTest, answeringRevoked(true)));

    await checkInstallation(depsFor(registerUnderTest, answeringRevoked(false)));
    await checkInstallation(depsFor(registerUnderTest, { kind: "unreachable" }));

    expect(registerUnderTest.revokedAt()).toBe(REVOKED_AT.toISOString());
  });

  it("does not record itself as revoked when the cloud only refuses its device token", async () => {
    const registerUnderTest = register();

    const attempt = await checkInstallation(
      depsFor(registerUnderTest, {
        kind: "error",
        error: cloudError("device_token_rejected", "the device token is not recognized"),
      }),
    );

    expect(attempt).toEqual({
      kind: "failed",
      failure: { kind: "refused", code: "device_token_rejected" },
    });
    expect(registerUnderTest.revokedAt()).toBeNull();
  });

  it("records the revocation for the installation the credentials belong to, not a previous one", async () => {
    const registerUnderTest = register();
    registerUnderTest.replica.adoptDevice({ deviceId: "previous", pepper: "cGVwcGVy" });

    await checkInstallation(depsFor(registerUnderTest, answeringRevoked(true)));
    registerUnderTest.replica.adoptDevice({ deviceId: CREDENTIALS.device_id, pepper: "cGVwcGVy" });

    expect(registerUnderTest.revokedAt()).toBe(REVOKED_AT.toISOString());
  });

  it("does nothing before the register is enrolled", async () => {
    const registerUnderTest = register();

    const attempt = await checkInstallation(
      depsFor(registerUnderTest, answeringRevoked(true), { readCredentials: async () => undefined }),
    );

    expect(attempt).toEqual({ kind: "not_enrolled" });
    expect(registerUnderTest.revokedAt()).toBeNull();
  });

  it("does nothing when the channel has no cloud", async () => {
    const attempt = await checkInstallation(
      depsFor(register(), answeringRevoked(true), { getFromCloud: undefined }),
    );

    expect(attempt).toEqual({ kind: "no_cloud" });
  });

  it("does nothing without a local database", async () => {
    const attempt = await checkInstallation(
      depsFor(register(), answeringRevoked(true), { installation: undefined }),
    );

    expect(attempt).toEqual({ kind: "no_local_database" });
  });
});

describe("the sync result of checking the installation", () => {
  it("counts a check that got the installation's standing, or had nothing to check, as succeeded", () => {
    for (const attempt of [
      { kind: "in_service" },
      { kind: "revoked" },
      { kind: "not_enrolled" },
      { kind: "no_cloud" },
      { kind: "no_local_database" },
    ] as const) {
      expect(installationCheckResultOf(attempt)).toEqual({ kind: "succeeded" });
    }
  });

  it("counts a failed check as failed, carrying the wait the cloud asked for", () => {
    expect(
      installationCheckResultOf({ kind: "failed", failure: { kind: "unreachable" } }),
    ).toEqual({ kind: "failed" });
    expect(
      installationCheckResultOf({
        kind: "failed",
        failure: { kind: "refused", code: "rate_limited", retryAfterSeconds: 30 },
      }),
    ).toEqual({ kind: "failed", retryAfterMs: 30_000 });
  });
});
