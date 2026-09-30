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
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

const MIGRATION_TAG_SUFFIX = "_sign_in_lookup_attempts";

describe("the sign-in lookup attempts migration applied over a database that already holds registers", {
  timeout: 30_000,
}, () => {
  it("keeps every register and records lookups by register", async () => {
    const entry = await findMigrationEntry(
      MIGRATION_TAG_SUFFIX,
      "test setup: no sign-in lookup attempts migration in the journal",
    );
    const folder = await mkdtemp(join(tmpdir(), "sign-in-lookup-attempts-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, entry);

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

    await addMigrationEntry(folder, entry);
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: registers } = await client.query("select * from registers");
    expect(registers).toHaveLength(1);
    await client.query(
      "insert into sign_in_lookup_attempts (register_id, attempted_at) values ($1, now()), ($1, now())",
      [registerId],
    );
    const { rows: attempts } = await client.query("select * from sign_in_lookup_attempts");
    expect(attempts).toHaveLength(2);
    await expect(
      client.query(
        "insert into sign_in_lookup_attempts (register_id, attempted_at) values (gen_random_uuid(), now())",
      ),
    ).rejects.toThrow();
  });
});
