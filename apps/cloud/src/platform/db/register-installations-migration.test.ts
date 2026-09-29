import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

async function registerInstallationsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_register_installations",
    "test setup: no register installations migration in the journal",
  );
}

describe("the register installations migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every register and its code, leaving a code emitted before it unredeemable", async () => {
    const folder = await mkdtemp(join(tmpdir(), "register-installations-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await registerInstallationsEntry());

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: locationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const locationId = locationRows[0]?.id;
    const { rows: registerRows } = await client.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationId],
    );
    const registerId = registerRows[0]?.id;
    await client.query(
      `insert into register_enrollment_codes (register_id, code_hash, issued_at, expires_at)
       values ($1, 'hash', now(), now() + interval '15 minutes')`,
      [registerId],
    );

    await addMigrationEntry(folder, await registerInstallationsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: codesAfter } = await client.query<{ register_id: string; code_lookup: string }>(
      "select register_id, code_lookup from register_enrollment_codes",
    );
    expect(codesAfter).toEqual([{ register_id: registerId, code_lookup: "" }]);

    await expect(
      client.query(
        `insert into register_installations
           (register_id, token_lookup_prefix, token_hash, hostname, windows_version, enrolled_at)
         values ($1, 'prefix', 'hash', 'CAJA', 'Windows 11', now()) returning id`,
        [registerId],
      ),
    ).resolves.toMatchObject({ rows: [{ id: expect.any(String) }] });
  });
});
