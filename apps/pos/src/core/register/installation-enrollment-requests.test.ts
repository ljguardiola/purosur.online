import { afterEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { stopOpeningNewSales } from "../sync/sqlite-local-installation";
import { enrollmentStandingOf } from "./installation-enrollment-requests";

const STOPPED_AT = new Date("2026-10-01T09:30:00.000Z");
const databases: LocalDatabase[] = [];

function registerOfDevice(deviceId: string): LocalDatabase {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.prepare("UPDATE sync_state SET device_id = ?").run(deviceId);
  databases.push(database);
  return database;
}

function credentialsOf(deviceId: string | undefined) {
  return async () => (deviceId === undefined ? undefined : { device_id: deviceId });
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe("the enrollment standing the register answers", () => {
  it("is not enrolled without stored credentials", async () => {
    const database = registerOfDevice("device-a");
    stopOpeningNewSales(database, "installation_revoked", STOPPED_AT);

    await expect(
      enrollmentStandingOf({ readCredentials: credentialsOf(undefined), database }),
    ).resolves.toEqual({ kind: "not_enrolled" });
  });

  it("is enrolled when no sales stop is recorded, as with no connection or a wrong PIN", async () => {
    const database = registerOfDevice("device-a");

    await expect(
      enrollmentStandingOf({ readCredentials: credentialsOf("device-a"), database }),
    ).resolves.toEqual({ kind: "enrolled" });
  });

  it.each(["installation_revoked", "event_history_broken"] as const)(
    "is revoked with its reason when the cloud stopped this installation: %s",
    async (reason) => {
      const database = registerOfDevice("device-a");
      stopOpeningNewSales(database, reason, STOPPED_AT);

      await expect(
        enrollmentStandingOf({ readCredentials: credentialsOf("device-a"), database }),
      ).resolves.toEqual({ kind: "revoked", reason });
    },
  );

  it("is enrolled again once new credentials of another device are stored", async () => {
    const database = registerOfDevice("device-a");
    stopOpeningNewSales(database, "installation_revoked", STOPPED_AT);

    await expect(
      enrollmentStandingOf({ readCredentials: credentialsOf("device-b"), database }),
    ).resolves.toEqual({ kind: "enrolled" });
  });

  it("follows the stored credentials alone when there is no local database", async () => {
    await expect(
      enrollmentStandingOf({ readCredentials: credentialsOf("device-a"), database: undefined }),
    ).resolves.toEqual({ kind: "enrolled" });
    await expect(
      enrollmentStandingOf({ readCredentials: credentialsOf(undefined), database: undefined }),
    ).resolves.toEqual({ kind: "not_enrolled" });
  });
});
