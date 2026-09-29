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

async function deviceTokenRotationEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_device_token_rotation",
    "test setup: no device token rotation migration in the journal",
  );
}

describe("the device token rotation migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps an enrolled installation, with a token issue time and no pending token", async () => {
    const folder = await mkdtemp(join(tmpdir(), "device-token-rotation-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await deviceTokenRotationEntry());

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: locationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: registerRows } = await client.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationRows[0]?.id],
    );
    const registerId = registerRows[0]?.id;
    await client.query(
      `insert into register_installations
         (register_id, token_lookup_prefix, token_hash, hostname, windows_version, enrolled_at)
       values ($1, 'prefix', 'hash', 'CAJA', 'Windows 11', now())`,
      [registerId],
    );

    await addMigrationEntry(folder, await deviceTokenRotationEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query<{
      token_lookup_prefix: string;
      token_issued_at: Date | null;
      pending_token_lookup_prefix: string | null;
      pending_token_hash: string | null;
      pending_token_issued_at: Date | null;
    }>(
      `select token_lookup_prefix, token_issued_at, pending_token_lookup_prefix,
              pending_token_hash, pending_token_issued_at
       from register_installations`,
    );
    expect(rows).toEqual([
      {
        token_lookup_prefix: "prefix",
        token_issued_at: expect.any(Date),
        pending_token_lookup_prefix: null,
        pending_token_hash: null,
        pending_token_issued_at: null,
      },
    ]);
  });

  it("refuses two installations holding the same pending token", async () => {
    const folder = await mkdtemp(join(tmpdir(), "device-token-rotation-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await deviceTokenRotationEntry());
    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());
    await addMigrationEntry(folder, await deviceTokenRotationEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: locationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const insertInstallation = async (prefix: string) => {
      const { rows } = await client.query<{ id: string }>(
        "insert into registers (location_id, name) values ($1, $2) returning id",
        [locationRows[0]?.id, `Caja ${prefix}`],
      );
      return client.query(
        `insert into register_installations
           (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname,
            windows_version, enrolled_at, pending_token_lookup_prefix, pending_token_hash,
            pending_token_issued_at)
         values ($1, $2, 'hash', now(), 'CAJA', 'Windows 11', now(), 'shared', 'hash', now())`,
        [rows[0]?.id, prefix],
      );
    };

    await insertInstallation("first");

    await expect(insertInstallation("second")).rejects.toThrow();
  });
});
