import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import {
  SqliteLocalInstallation,
  salesStopOf,
  stopOpeningNewSales,
} from "./sqlite-local-installation";

const REVOKED_AT = new Date("2026-10-01T09:30:00.000Z");
const folders: string[] = [];

function databasePath(): string {
  const folder = mkdtempSync(join(tmpdir(), "purosur-pos-local-installation-"));
  folders.push(folder);
  return join(folder, "register.sqlite");
}

function openRegister(path = ":memory:"): LocalDatabase {
  const database = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
  database.prepare("UPDATE sync_state SET device_id = 'device-a'").run();
  return database;
}

function revokedAt(database: LocalDatabase): string | null | undefined {
  return database
    .prepare<[], { installation_revoked_at: string | null }>(
      "SELECT installation_revoked_at FROM sync_state",
    )
    .get()?.installation_revoked_at;
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe("recording that the installation was revoked", () => {
  it("stops the register from opening new sales", async () => {
    const database = openRegister();

    await new SqliteLocalInstallation(database, () => REVOKED_AT).recordRevoked();

    expect(revokedAt(database)).toBe(REVOKED_AT.toISOString());
    database.close();
  });

  it("keeps the moment it was first stopped", async () => {
    const database = openRegister();
    database
      .prepare("UPDATE sync_state SET installation_revoked_at = '2026-09-30T08:00:00.000Z'")
      .run();

    await new SqliteLocalInstallation(database, () => REVOKED_AT).recordRevoked();

    expect(revokedAt(database)).toBe("2026-09-30T08:00:00.000Z");
    database.close();
  });

  it("is still known after the register restarts", async () => {
    const path = databasePath();
    const before = openRegister(path);
    await new SqliteLocalInstallation(before, () => REVOKED_AT).recordRevoked();
    before.close();

    const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

    expect(revokedAt(after)).toBe(REVOKED_AT.toISOString());
    after.close();
  });
});

describe("the reason a register stopped opening new sales", () => {
  it("is none for a register that still opens them", () => {
    const database = openRegister();

    expect(salesStopOf(database)).toEqual({ stopped: false });
    database.close();
  });

  it("is that the installation was revoked once the cloud said so", async () => {
    const database = openRegister();

    await new SqliteLocalInstallation(database, () => REVOKED_AT).recordRevoked();

    expect(salesStopOf(database)).toEqual({ stopped: true, reason: "installation_revoked" });
    database.close();
  });

  it("is the first one it was stopped for", () => {
    const database = openRegister();

    stopOpeningNewSales(database, "event_history_broken", REVOKED_AT);
    stopOpeningNewSales(database, "installation_revoked", new Date(REVOKED_AT.getTime() + 1000));

    expect(salesStopOf(database)).toEqual({ stopped: true, reason: "event_history_broken" });
    database.close();
  });

  it("is unknown for a register stopped before it recorded the reason", () => {
    const database = openRegister();
    database
      .prepare("UPDATE sync_state SET installation_revoked_at = '2026-09-30T08:00:00.000Z'")
      .run();

    expect(salesStopOf(database)).toEqual({ stopped: true, reason: undefined });
    database.close();
  });

  it("is unknown for a reason this version does not know", () => {
    const database = openRegister();
    database
      .prepare(
        `UPDATE sync_state SET installation_revoked_at = '2026-09-30T08:00:00.000Z',
                               sales_stopped_reason = 'out_of_paper'`,
      )
      .run();

    expect(salesStopOf(database)).toEqual({ stopped: true, reason: undefined });
    database.close();
  });

  it("is still known after the register restarts", async () => {
    const path = databasePath();
    const before = openRegister(path);
    stopOpeningNewSales(before, "event_history_broken", REVOKED_AT);
    before.close();

    const after = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);

    expect(salesStopOf(after)).toEqual({ stopped: true, reason: "event_history_broken" });
    after.close();
  });
});
