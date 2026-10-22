import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { installationHeld, staleSequenceDetected } from "./sqlite-installation-presence";

let database: LocalDatabase;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

afterEach(() => {
  database.close();
});

describe("installationHeld", () => {
  it("is false for a local database that never held an installation", () => {
    expect(installationHeld(database)).toBe(false);
  });

  it("is true once an installation was adopted", () => {
    database.exec("UPDATE sync_state SET device_id = 'device-a'");

    expect(installationHeld(database)).toBe(true);
  });
});

describe("staleSequenceDetected", () => {
  it("is false for a register the cloud never refused as stale", () => {
    expect(staleSequenceDetected(database)).toBe(false);
  });

  it("is true once the cloud refused the register's sequence as stale", () => {
    database.exec("UPDATE sync_state SET stale_sequence_detected_at = '2026-10-18T09:00:00.000Z'");

    expect(staleSequenceDetected(database)).toBe(true);
  });
});
