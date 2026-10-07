import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteLocalInstallation } from "./sqlite-local-installation";

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
