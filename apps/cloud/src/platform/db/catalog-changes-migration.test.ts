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

const CATEGORY_A = "00000000-0000-4000-8000-0000000000a1";
const CATEGORY_B = "00000000-0000-4000-8000-0000000000a2";
const PRODUCT_A = "00000000-0000-4000-8000-0000000000b1";
const PRODUCT_B = "00000000-0000-4000-8000-0000000000b2";
const OTHER_PRICE_LIST = "00000000-0000-4000-8000-0000000000c1";
const PRICE_A = "00000000-0000-4000-8000-0000000000d1";
const PRICE_B = "00000000-0000-4000-8000-0000000000d2";

async function catalogChangesEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_catalog_changes",
    "test setup: no catalog changes migration in the journal",
  );
}

describe("the catalog changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs every existing category, product, price list and price as an insert, so a register pulling from the start receives them", async () => {
    const folder = await mkdtemp(join(tmpdir(), "catalog-changes-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await catalogChangesEntry());
    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: seededPriceLists } = await client.query<{ id: string }>(
      "select id from price_lists",
    );
    const seededPriceList = seededPriceLists[0]?.id;
    await client.query("insert into price_lists (id, name) values ($1, 'Lista mayorista')", [
      OTHER_PRICE_LIST,
    ]);
    await client.query(
      "insert into categories (id, name, version) values ($1, 'Lácteos', 3), ($2, 'Almacén', 1)",
      [CATEGORY_B, CATEGORY_A],
    );
    await client.query(
      `insert into products (id, name, category_id, sale_unit, version)
       values ($1, 'Yerba', $3, 'UNIT', 5), ($2, 'Arroz', $3, 'UNIT', 1)`,
      [PRODUCT_B, PRODUCT_A, CATEGORY_A],
    );
    await client.query(
      `insert into prices (id, product_id, price_list_id, unit_price)
       values ($1, $3, $4, 1000), ($2, $3, $5, 900)`,
      [PRICE_B, PRICE_A, PRODUCT_A, seededPriceList, OTHER_PRICE_LIST],
    );
    const { rows: before } = await client.query("select entity from changes");

    await addMigrationEntry(folder, await catalogChangesEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: logged } = await client.query(
      `select entity, entity_id, version, op, price_list_id, origin_device_id
       from changes order by change_seq offset $1`,
      [before.length],
    );
    const insert = { op: "insert", origin_device_id: null };
    expect(logged).toEqual([
      { ...insert, entity: "category", entity_id: CATEGORY_A, version: 1, price_list_id: null },
      { ...insert, entity: "category", entity_id: CATEGORY_B, version: 3, price_list_id: null },
      { ...insert, entity: "product", entity_id: PRODUCT_A, version: 1, price_list_id: null },
      { ...insert, entity: "product", entity_id: PRODUCT_B, version: 5, price_list_id: null },
      ...[seededPriceList, OTHER_PRICE_LIST].sort().map((id) => ({
        ...insert,
        entity: "price_list",
        entity_id: id,
        version: 1,
        price_list_id: null,
      })),
      {
        ...insert,
        entity: "price",
        entity_id: PRICE_A,
        version: 1,
        price_list_id: OTHER_PRICE_LIST,
      },
      {
        ...insert,
        entity: "price",
        entity_id: PRICE_B,
        version: 1,
        price_list_id: seededPriceList,
      },
    ]);
  });

  it("gives every existing price list the first version", async () => {
    const folder = await mkdtemp(join(tmpdir(), "catalog-changes-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await catalogChangesEntry());
    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    await addMigrationEntry(folder, await catalogChangesEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query("select version from price_lists");
    expect(rows).toEqual([{ version: 1 }]);
  });
});
