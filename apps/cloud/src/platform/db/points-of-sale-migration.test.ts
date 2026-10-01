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

async function pointsOfSaleEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_fiscal_addresses_and_points_of_sale",
    "test setup: no points of sale migration in the journal",
  );
}

async function databaseBeforeMigration() {
  const folder = await mkdtemp(join(tmpdir(), "points-of-sale-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await pointsOfSaleEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  return { folder, client };
}

describe("the points of sale migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every existing register, with no point of sale and no fiscal address, and logs nothing for them", async () => {
    const { folder, client } = await databaseBeforeMigration();
    await client.query(
      `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1`,
    );
    const { rows: before } = await client.query("select entity from changes");

    await addMigrationEntry(folder, await pointsOfSaleEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: registers } = await client.query("select name from registers");
    const { rows: setups } = await client.query("select register_id from register_points_of_sale");
    const { rows: claims } = await client.query("select register_id from point_of_sale_claims");
    const { rows: addresses } = await client.query("select id from fiscal_addresses");
    const { rows: after } = await client.query("select entity from changes");
    expect(registers).toEqual([{ name: "Caja 1" }]);
    expect([setups, claims, addresses]).toEqual([[], [], []]);
    expect(after).toHaveLength(before.length);
  });
});
