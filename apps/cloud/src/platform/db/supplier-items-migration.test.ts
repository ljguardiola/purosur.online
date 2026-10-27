import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

type Value = string | number | boolean | null;

async function databaseHoldingARow() {
  const database = await databaseBeforeMigration("_supplier_items");
  const { rows: users } = await database.query<{ id: string; location_id: string }>(
    `insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning id, location_id`,
  );
  const userId = users[0]?.id as string;
  const { rows: suppliers } = await database.query<{ id: string }>(
    `insert into suppliers (name, actor_id) values ('Distribuidora Ejemplo', $1) returning id`,
    [userId],
  );
  const supplierId = suppliers[0]?.id as string;
  const { rows: lists } = await database.query<{ id: string }>(
    `insert into supplier_price_lists
       (supplier_id, location_id, source_kind, file_name, file_content_kind, file_byte_size, state, uploaded_at, uploaded_by)
     values ($1, $2, 'PDF', 'lista.pdf', 'PDF', 1000, 'EXTRACTED', '2026-03-01T12:00:00Z', $3) returning id`,
    [supplierId, users[0]?.location_id, userId],
  );
  const listId = lists[0]?.id as string;
  await database.query(
    `insert into supplier_price_list_rows (list_id, position, description, price_cents) values ($1, 0, 'Yerba 1 kg', 1500)`,
    [listId],
  );
  const { rows: categories } = await database.query<{ id: string }>(
    `insert into categories (name) values ('Almacén') returning id`,
  );
  const { rows: products } = await database.query<{ id: string }>(
    `insert into products (name, category_id, sale_unit) values ('Yerba 1 kg', $1, 'UNIT') returning id`,
    [categories[0]?.id],
  );
  const productId = products[0]?.id as string;
  const { rows: packagings } = await database.query<{ id: string }>(
    `insert into product_packagings (product_id, name, quantity_per_package, sale_unit, actor_id)
     values ($1, 'Caja x 10', 10000, 'UNIT', $2) returning id`,
    [productId, userId],
  );
  return {
    database,
    userId,
    supplierId,
    listId,
    productId,
    packagingId: packagings[0]?.id as string,
  };
}

async function migratedDatabase() {
  const before = await databaseHoldingARow();
  const migrated = await before.database.applyMigration();
  const insert = async (table: string, values: Record<string, Value>) => {
    const columns = Object.keys(values);
    const { rows } = await migrated.query<{ id: string }>(
      `insert into ${table} (${columns.join(", ")})
       values (${columns.map((_column, index) => `$${index + 1}`).join(", ")}) returning *`,
      Object.values(values),
    );
    const [row] = rows;
    if (row === undefined) {
      throw new Error(`${table} returned no inserted row`);
    }
    return row;
  };
  const insertItem = (overrides: Record<string, Value> = {}) =>
    insert("supplier_items", {
      supplier_id: before.supplierId,
      key_kind: "code",
      key_value: "Y-01",
      description: "Yerba 1 kg",
      ...overrides,
    });
  const insertPrice = (itemId: string, overrides: Record<string, Value> = {}) =>
    insert("supplier_item_prices", {
      item_id: itemId,
      list_id: before.listId,
      price_cents: 1_500,
      list_date: "2026-03-01",
      prices_include_vat: false,
      confirmed_at: "2026-03-02T12:00:00Z",
      ...overrides,
    });
  return { ...before, migrated, insertItem, insertPrice };
}

describe("the supplier items migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the rows of a list as not linked, not reviewed, not linked by a person and without a barcode", async () => {
    const { migrated, listId } = await migratedDatabase();

    const { rows } = await migrated.query(
      `select barcode, product_id, packaging_id, vat_rate, reviewed, linked_by_person, description, price_cents
       from supplier_price_list_rows where list_id = $1`,
      [listId],
    );

    expect(rows).toEqual([
      {
        barcode: null,
        product_id: null,
        packaging_id: null,
        vat_rate: null,
        reviewed: false,
        linked_by_person: false,
        description: "Yerba 1 kg",
        price_cents: 1_500,
      },
    ]);
  });

  it.each<[string, number | null]>([
    ["a product and its packaging", null],
    ["a product and its packaging with a VAT rate", 1050],
  ])("accepts a row linked to %s", async (_name, vatRate) => {
    const { migrated, listId, productId, packagingId } = await migratedDatabase();

    await migrated.query(
      `update supplier_price_list_rows set product_id = $2, packaging_id = $3, vat_rate = $4 where list_id = $1`,
      [listId, productId, packagingId, vatRate],
    );

    const { rows } = await migrated.query(
      "select vat_rate from supplier_price_list_rows where list_id = $1",
      [listId],
    );
    expect(rows).toEqual([{ vat_rate: vatRate }]);
  });

  it.each([
    ["a product without a packaging", (ids: { productId: string }) => [ids.productId, null, null]],
    [
      "a packaging without a product",
      (ids: { packagingId: string }) => [null, ids.packagingId, null],
    ],
    [
      "a VAT rate that is not offered",
      (ids: { productId: string; packagingId: string }) => [ids.productId, ids.packagingId, 500],
    ],
  ])("refuses a row linked with %s", async (_name, values) => {
    const database = await migratedDatabase();
    const [productId, packagingId, vatRate] = values(database);

    await expect(
      database.migrated.query(
        `update supplier_price_list_rows set product_id = $2, packaging_id = $3, vat_rate = $4 where list_id = $1`,
        [database.listId, productId, packagingId, vatRate],
      ),
    ).rejects.toThrow();
  });

  it("starts an item without a link, a VAT rate or a recorded price", async () => {
    const { migrated, insertItem } = await migratedDatabase();

    const item = await insertItem();

    const { rows } = await migrated.query(
      "select key_kind, key_value, description, product_id, packaging_id, vat_rate from supplier_items where id = $1",
      [item.id],
    );
    expect(rows).toEqual([
      {
        key_kind: "code",
        key_value: "Y-01",
        description: "Yerba 1 kg",
        product_id: null,
        packaging_id: null,
        vat_rate: null,
      },
    ]);
  });

  it.each([
    ["a code", { key_kind: "code" }],
    ["a description", { key_kind: "description", key_value: "yerba 1 kg" }],
  ])("accepts an item identified by %s", async (_name, overrides) => {
    const { insertItem } = await migratedDatabase();

    await expect(insertItem(overrides)).resolves.toBeDefined();
  });

  it("accepts a linked item with a VAT rate offered", async () => {
    const { migrated, insertItem, productId, packagingId } = await migratedDatabase();

    const item = await insertItem({
      product_id: productId,
      packaging_id: packagingId,
      vat_rate: 2100,
    });

    const { rows } = await migrated.query("select vat_rate from supplier_items where id = $1", [
      item.id,
    ]);
    expect(rows).toEqual([{ vat_rate: 2100 }]);
  });

  it.each([
    ["a key that is neither a code nor a description", () => ({ key_kind: "barcode" })],
    [
      "a product without a packaging",
      (ids: { productId: string }) => ({ product_id: ids.productId }),
    ],
    [
      "a packaging without a product",
      (ids: { packagingId: string }) => ({ packaging_id: ids.packagingId }),
    ],
    ["a VAT rate that is not offered", () => ({ vat_rate: 700 })],
    ["a missing description", () => ({ description: null })],
  ])("refuses an item with %s", async (_name, overrides) => {
    const database = await migratedDatabase();

    await expect(database.insertItem(overrides(database))).rejects.toThrow();
  });

  it("refuses a second item of a supplier with the same key", async () => {
    const { insertItem } = await migratedDatabase();
    await insertItem();

    await expect(insertItem({ description: "Otra yerba" })).rejects.toThrow();
  });

  it("accepts the same value as a code and as a description, and the same key for another supplier", async () => {
    const { migrated, userId, insertItem } = await migratedDatabase();
    const { rows } = await migrated.query<{ id: string }>(
      `insert into suppliers (name, actor_id) values ('Mayorista Ejemplo', $1) returning id`,
      [userId],
    );

    await insertItem();
    await insertItem({ key_kind: "description" });

    await expect(insertItem({ supplier_id: rows[0]?.id as string })).resolves.toBeDefined();
  });

  it("keeps the price an item recorded for a list with its date, VAT answer and confirmation instant", async () => {
    const { migrated, insertItem, insertPrice } = await migratedDatabase();
    const item = await insertItem();

    await insertPrice(item.id);

    const { rows } = await migrated.query(
      `select price_cents, list_date::text as list_date, prices_include_vat, confirmed_at
       from supplier_item_prices where item_id = $1`,
      [item.id],
    );
    expect(rows).toEqual([
      {
        price_cents: 1_500,
        list_date: "2026-03-01",
        prices_include_vat: false,
        confirmed_at: new Date("2026-03-02T12:00:00Z"),
      },
    ]);
  });

  it.each([
    ["a negative price", { price_cents: -1 }],
    ["a missing list date", { list_date: null }],
    ["a missing VAT answer", { prices_include_vat: null }],
    ["a missing confirmation instant", { confirmed_at: null }],
  ])("refuses a recorded price with %s", async (_name, overrides) => {
    const { insertItem, insertPrice } = await migratedDatabase();
    const item = await insertItem();

    await expect(insertPrice(item.id, overrides)).rejects.toThrow();
  });

  it("accepts a free item priced at zero", async () => {
    const { insertItem, insertPrice } = await migratedDatabase();
    const item = await insertItem();

    await expect(insertPrice(item.id, { price_cents: 0 })).resolves.toBeDefined();
  });

  it("refuses a second price of an item for the same list", async () => {
    const { insertItem, insertPrice } = await migratedDatabase();
    const item = await insertItem();
    await insertPrice(item.id);

    await expect(insertPrice(item.id, { price_cents: 1_600 })).rejects.toThrow();
  });

  it("refuses a price of an item that does not exist or for a list that does not exist", async () => {
    const { insertItem, insertPrice } = await migratedDatabase();
    const item = await insertItem();
    const missing = "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f";

    await expect(insertPrice(missing)).rejects.toThrow();
    await expect(insertPrice(item.id, { list_id: missing })).rejects.toThrow();
  });
});
