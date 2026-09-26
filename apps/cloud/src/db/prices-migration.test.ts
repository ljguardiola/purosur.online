import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./migration-journal-test-helpers.js";
import { migrateFreshDatabase } from "./test-database-snapshot.js";

const PRICES_MIGRATION_TAG_SUFFIX = "_prices_and_price_reviews";

async function pricesEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    PRICES_MIGRATION_TAG_SUFFIX,
    "test setup: no prices_and_price_reviews migration in the journal",
  );
}

describe("the prices migration applied to a database that already holds branch settings", {
  timeout: 30_000,
}, () => {
  it("points every existing branch at the one price list it creates", async () => {
    const folder = await mkdtemp(join(tmpdir(), "prices-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await pricesEntry());

    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: secondLocationRows } = await client.query<{ id: string }>(
      "insert into locations default values returning id",
    );
    const secondLocation = secondLocationRows[0];
    if (!secondLocation) {
      throw new Error("test setup: seeding the second location returned no row");
    }
    await client.query("insert into branch_settings (location_id) values ($1)", [
      secondLocation.id,
    ]);
    const { rows: locationRows } = await client.query<{ id: string }>("select id from locations");
    expect(locationRows).toHaveLength(2);

    await addMigrationEntry(folder, await pricesEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: priceListRows } = await client.query<{ id: string; name: string }>(
      "select id, name from price_lists",
    );
    expect(priceListRows).toEqual([{ id: expect.any(String), name: "Lista general" }]);
    const generalListId = priceListRows[0]?.id;

    const { rows: settingsRows } = await client.query<{
      location_id: string;
      price_list_id: string;
    }>("select location_id, price_list_id from branch_settings");
    expect(settingsRows).toHaveLength(2);
    expect(settingsRows.map((row) => row.price_list_id)).toEqual([generalListId, generalListId]);
    expect(settingsRows.map((row) => row.location_id).sort()).toEqual(
      locationRows.map((row) => row.id).sort(),
    );
  });
});
