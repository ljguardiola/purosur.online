import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const CATEGORY_A = "00000000-0000-4000-8000-0000000000a1";
const CATEGORY_B = "00000000-0000-4000-8000-0000000000a2";
const PRODUCT_A = "00000000-0000-4000-8000-0000000000b1";
const PRODUCT_B = "00000000-0000-4000-8000-0000000000b2";
const OTHER_PRICE_LIST = "00000000-0000-4000-8000-0000000000c1";
const PRICE_A = "00000000-0000-4000-8000-0000000000d1";
const PRICE_B = "00000000-0000-4000-8000-0000000000d2";
const TAG_A = "00000000-0000-4000-8000-0000000000e1";
const TAG_B = "00000000-0000-4000-8000-0000000000e2";

describe("the catalog changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs every existing category, product, price list and price as an insert, so a register pulling from the start receives them", async () => {
    const database = await databaseBeforeMigration("_catalog_changes");

    const { rows: seededPriceLists } = await database.query<{ id: string }>(
      "select id from price_lists",
    );
    const seededPriceList = seededPriceLists[0]?.id;
    await database.query("insert into price_lists (id, name) values ($1, 'Lista mayorista')", [
      OTHER_PRICE_LIST,
    ]);
    await database.query(
      "insert into categories (id, name, version) values ($1, 'Lácteos', 3), ($2, 'Almacén', 1)",
      [CATEGORY_B, CATEGORY_A],
    );
    await database.query(
      `insert into products (id, name, category_id, sale_unit, version)
       values ($1, 'Yerba', $3, 'UNIT', 5), ($2, 'Arroz', $3, 'UNIT', 1)`,
      [PRODUCT_B, PRODUCT_A, CATEGORY_A],
    );
    await database.query(
      `insert into prices (id, product_id, price_list_id, unit_price)
       values ($1, $3, $4, 1000), ($2, $3, $5, 900)`,
      [PRICE_B, PRICE_A, PRODUCT_A, seededPriceList, OTHER_PRICE_LIST],
    );
    await database.query(
      "insert into tags (id, name, active, version) values ($1, 'Sin TACC', true, 2), ($2, 'Vegano', false, 1)",
      [TAG_B, TAG_A],
    );
    const { rows: before } = await database.query("select entity from changes");

    const migrated = await database.applyMigration();

    const { rows: logged } = await migrated.query(
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
      { ...insert, entity: "tag", entity_id: TAG_A, version: 1, price_list_id: null },
      { ...insert, entity: "tag", entity_id: TAG_B, version: 2, price_list_id: null },
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
    const database = await databaseBeforeMigration("_catalog_changes");

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select version from price_lists");
    expect(rows).toEqual([{ version: 1 }]);
  });
});
