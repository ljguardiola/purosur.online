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

const DISCOUNT_A = "00000000-0000-4000-8000-0000000000d1";
const DISCOUNT_B = "00000000-0000-4000-8000-0000000000d2";

async function discountsChangesEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_discounts_changes",
    "test setup: no discounts changes migration in the journal",
  );
}

describe("the discounts changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs every existing discount as an insert at its own version, so a register pulling from the start receives them", async () => {
    const folder = await mkdtemp(join(tmpdir(), "discounts-changes-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await discountsChangesEntry());
    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: categoryRows } = await client.query<{ id: string }>(
      "insert into categories (name) values ('Almacén') returning id",
    );
    const category = categoryRows[0]?.id;
    await client.query(
      `insert into discounts (id, name, kind, percent, category_id, valid_from, valid_to, version, active)
       values ($1, 'Fin de semana', 'PERCENT_OFF', 20, $3, '2026-10-01', '2026-10-31', 4, false),
              ($2, 'Martes', 'PERCENT_OFF', 10, $3, '2026-10-01', '2026-10-31', 1, true)`,
      [DISCOUNT_B, DISCOUNT_A, category],
    );
    const { rows: before } = await client.query("select entity from changes");

    await addMigrationEntry(folder, await discountsChangesEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: logged } = await client.query(
      `select entity, entity_id, version, op, location_id, origin_device_id
       from changes order by change_seq offset $1`,
      [before.length],
    );
    const insert = { entity: "discount", op: "insert", location_id: null, origin_device_id: null };
    expect(logged).toEqual([
      { ...insert, entity_id: DISCOUNT_A, version: 1 },
      { ...insert, entity_id: DISCOUNT_B, version: 4 },
    ]);
  });
});
