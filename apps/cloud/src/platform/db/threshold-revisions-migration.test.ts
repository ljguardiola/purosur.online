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

async function thresholdRevisionsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_threshold_revisions",
    "test setup: no threshold-revisions migration in the journal",
  );
}

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "threshold-revisions-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await thresholdRevisionsEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const applyMigration = async () => {
    await addMigrationEntry(folder, await thresholdRevisionsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });
  };
  return { client, applyMigration };
}

describe("the threshold-revisions migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded threshold as the first of its day", async () => {
    const { client, applyMigration } = await databaseBefore();
    await client.query("delete from changes where entity = 'buyer_identification_threshold'");
    await client.query("delete from buyer_identification_thresholds");
    await client.query(
      `insert into buyer_identification_thresholds (amount, valid_from)
       values (1000000, '2026-01-01'), (2000000, '2026-06-01')`,
    );

    await applyMigration();

    const { rows } = await client.query(
      "select amount, valid_from::text as valid_from, revision from buyer_identification_thresholds order by valid_from",
    );
    expect(rows).toEqual([
      { amount: 1_000_000, valid_from: "2026-01-01", revision: 0 },
      { amount: 2_000_000, valid_from: "2026-06-01", revision: 0 },
    ]);
  });

  it("allows another revision of a day and refuses a repeated one", async () => {
    const { client, applyMigration } = await databaseBefore();
    await client.query("delete from changes where entity = 'buyer_identification_threshold'");
    await client.query("delete from buyer_identification_thresholds");
    await client.query(
      "insert into buyer_identification_thresholds (amount, valid_from) values (1000000, '2026-06-01')",
    );
    await applyMigration();

    await client.query(
      `insert into buyer_identification_thresholds (amount, valid_from, revision)
       values (2000000, '2026-06-01', 1)`,
    );

    await expect(
      client.query(
        `insert into buyer_identification_thresholds (amount, valid_from, revision)
         values (3000000, '2026-06-01', 1)`,
      ),
    ).rejects.toThrow();
  });
});
