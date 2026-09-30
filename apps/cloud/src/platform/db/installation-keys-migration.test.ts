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

async function installationKeysEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_installation_keys",
    "test setup: no installation keys migration in the journal",
  );
}

describe("the installation keys migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps an enrolled installation, with no outbox-chain key and no key for its register", async () => {
    const folder = await mkdtemp(join(tmpdir(), "installation-keys-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await installationKeysEntry());
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
         (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname,
          windows_version, enrolled_at)
       values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now())`,
      [registerId],
    );

    await addMigrationEntry(folder, await installationKeysEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query<{ token_lookup_prefix: string; outbox_chain_key: null }>(
      "select token_lookup_prefix, outbox_chain_key from register_installations",
    );
    expect(rows).toEqual([{ token_lookup_prefix: "prefix", outbox_chain_key: null }]);
    const { rows: keyRows } = await client.query(
      `select register_id from register_snapshot_keys
       union all select register_id from register_contingency_ticket_keys`,
    );
    expect(keyRows).toEqual([]);
  });

  it.each(["register_snapshot_keys", "register_contingency_ticket_keys"])(
    "refuses a key in %s for a register that does not exist",
    async (table) => {
      const folder = await mkdtemp(join(tmpdir(), "installation-keys-migration-"));
      onTestFinished(() => rm(folder, { recursive: true, force: true }));
      await migrationsFolderBefore(folder, await installationKeysEntry());
      const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
      onTestFinished(() => client.close());
      await addMigrationEntry(folder, await installationKeysEntry());
      await migrate(drizzle(client), { migrationsFolder: folder });

      await expect(
        client.query(
          `insert into ${table} (register_id, version, key)
         values ('00000000-0000-4000-8000-000000000000', 1, 'key')`,
        ),
      ).rejects.toThrow();
    },
  );
});
