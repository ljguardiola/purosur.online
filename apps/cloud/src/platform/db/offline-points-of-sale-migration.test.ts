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

async function offlinePointsOfSaleEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_offline_points_of_sale",
    "test setup: no offline points of sale migration in the journal",
  );
}

async function databaseBeforeMigration() {
  const folder = await mkdtemp(join(tmpdir(), "offline-points-of-sale-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await offlinePointsOfSaleEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  return { folder, client };
}

describe("the offline points of sale migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every register's real-time point of sale and its claim, marking both real-time", async () => {
    const { folder, client } = await databaseBeforeMigration();
    await client.query(
      `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1`,
    );
    await client.query(
      `insert into users (first_name, email, location_id)
       select 'Ada Lucero', 'ada@example.com', id from locations limit 1`,
    );
    await client.query(
      `insert into fiscal_addresses (name, street_address) values ('Deposito', 'Calle Ficticia 123')`,
    );
    await client.query(
      `insert into point_of_sale_claims (point_of_sale_number, register_id, claimed_by)
       select 7, r.id, u.id from registers r, users u`,
    );
    await client.query(
      `insert into register_points_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
       select r.id, 7, f.id, 1 from registers r, fiscal_addresses f`,
    );

    await addMigrationEntry(folder, await offlinePointsOfSaleEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: claims } = await client.query(
      "select point_of_sale_number, mechanism from point_of_sale_claims",
    );
    const { rows: setups } = await client.query(
      "select point_of_sale_number, mechanism, version from register_points_of_sale",
    );
    const { rows: offline } = await client.query(
      "select register_id from register_offline_points_of_sale",
    );
    expect(claims).toEqual([{ point_of_sale_number: 7, mechanism: "real_time" }]);
    expect(setups).toEqual([{ point_of_sale_number: 7, mechanism: "real_time", version: 1 }]);
    expect(offline).toEqual([]);
  });
});
