import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function databaseHoldingAListWithARow() {
  const database = await databaseBeforeMigration("_supplier_item_proposals");
  const { rows: users } = await database.query<{ id: string; location_id: string }>(
    `insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning id, location_id`,
  );
  const userId = users[0]?.id as string;
  const { rows: suppliers } = await database.query<{ id: string }>(
    `insert into suppliers (name, actor_id) values ('Distribuidora Ejemplo', $1) returning id`,
    [userId],
  );
  const { rows: lists } = await database.query<{ id: string }>(
    `insert into supplier_price_lists
       (supplier_id, location_id, source_kind, source_url, file_content_kind, file_byte_size, state, uploaded_at, uploaded_by, sent_at, sent_on)
     values ($1, $2, 'WEB_PAGE', 'https://distribuidora-sur.example/catalogo', 'STORE_CATALOG', 1000, 'EXTRACTED', '2026-03-01T12:00:00Z', $3, '2026-03-01T12:01:00Z', '2026-03-01')
     returning id`,
    [suppliers[0]?.id, users[0]?.location_id, userId],
  );
  const { rows } = await database.query<{ id: string }>(
    `insert into supplier_price_list_rows (list_id, position, description, price_cents)
     values ($1, 0, 'Yerba mate 1 kg', 450000) returning id`,
    [lists[0]?.id],
  );
  const { rows: categories } = await database.query<{ id: string }>(
    `insert into categories (name) values ('Almacen') returning id`,
  );
  const { rows: products } = await database.query<{ id: string }>(
    `insert into products (name, category_id, sale_unit) values ('Yerba mate 1 kg', $1, 'UNIT') returning id`,
    [categories[0]?.id],
  );
  return {
    database,
    rowId: rows[0]?.id as string,
    productId: products[0]?.id as string,
  };
}

describe("the supplier item proposals migration applied over a database that already holds a list row", {
  timeout: 30_000,
}, () => {
  it("leaves the row with no proposal kept", async () => {
    const { database, rowId } = await databaseHoldingAListWithARow();

    const migrated = await database.applyMigration();

    const { rows: links } = await migrated.query(
      `select row_id from supplier_item_link_proposals where row_id = $1`,
      [rowId],
    );
    const { rows: quantities } = await migrated.query(
      `select id from supplier_item_quantity_proposals where row_id = $1`,
      [rowId],
    );
    expect([links, quantities]).toEqual([[], []]);
  });

  it("keeps one link proposal per row, either a product or none", async () => {
    const { database, rowId, productId } = await databaseHoldingAListWithARow();
    const migrated = await database.applyMigration();

    await migrated.query(
      `insert into supplier_item_link_proposals
         (row_id, asked_description, asked_other_presentations, kind, product_id, proposed_by, sale_unit, quantity)
       values ($1, 'Yerba mate 1 kg', '{}', 'PROPOSED', $2, 'AI', 'UNIT', 36000)`,
      [rowId, productId],
    );

    await expect(
      migrated.query(
        `insert into supplier_item_link_proposals (row_id, asked_description, asked_other_presentations, kind)
         values ($1, 'Yerba mate 1 kg', '{}', 'NONE')`,
        [rowId],
      ),
    ).rejects.toThrow();
  });

  it.each([
    ["a proposal with no product", `'Yerba', '{}', 'PROPOSED', null, 'AI', 'UNIT', null`],
    ["a proposal with no author", `'Yerba', '{}', 'PROPOSED', $2, null, 'UNIT', null`],
    ["a proposal by someone unknown", `'Yerba', '{}', 'PROPOSED', $2, 'GUESS', 'UNIT', null`],
    ["a proposal with no sale unit", `'Yerba', '{}', 'PROPOSED', $2, 'AI', null, null`],
    ["a proposal with an unknown sale unit", `'Yerba', '{}', 'PROPOSED', $2, 'AI', 'BOX', null`],
    ["a proposal with a zero quantity", `'Yerba', '{}', 'PROPOSED', $2, 'AI', 'UNIT', 0`],
    ["a none carrying a product", `'Yerba', '{}', 'NONE', $2, null, null, null`],
    ["a none carrying an author", `'Yerba', '{}', 'NONE', null, 'AI', null, null`],
    ["a none carrying a sale unit", `'Yerba', '{}', 'NONE', null, null, 'UNIT', null`],
    ["a none carrying a quantity", `'Yerba', '{}', 'NONE', null, null, null, 1000`],
    ["a kind that is neither", `'Yerba', '{}', 'MAYBE', null, null, null, null`],
    ["no row description it was asked from", `null, '{}', 'NONE', null, null, null, null`],
    ["no row presentations it was asked from", `'Yerba', null, 'NONE', null, null, null, null`],
  ])("refuses %s", async (_name, values) => {
    const { database, rowId, productId } = await databaseHoldingAListWithARow();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into supplier_item_link_proposals
           (row_id, asked_description, asked_other_presentations, kind, product_id, proposed_by, sale_unit, quantity)
         values ($1, ${values})`,
        [rowId, productId],
      ),
    ).rejects.toThrow();
  });

  it("keeps one quantity proposal per row, sale unit and net content, a missing net content being one value", async () => {
    const { database, rowId } = await databaseHoldingAListWithARow();
    const migrated = await database.applyMigration();
    const insert = (saleUnit: string, quantity: number | null, unit: string | null) =>
      migrated.query(
        `insert into supplier_item_quantity_proposals
           (row_id, asked_description, asked_other_presentations, sale_unit, net_content_quantity, net_content_unit, kind)
         values ($1, 'Yerba', '{}', $2, $3, $4, 'NONE')`,
        [rowId, saleUnit, quantity, unit],
      );

    await insert("UNIT", null, null);
    await insert("UNIT", 250, "ML");
    await insert("KG", null, null);
    await insert("UNIT", 500, "ML");

    await expect(insert("UNIT", null, null)).rejects.toThrow();
    await expect(insert("UNIT", 250, "ML")).rejects.toThrow();
  });

  it.each([
    ["a proposed kind without a quantity", `'UNIT', null, null, 'PROPOSED', null`],
    ["a none kind with a quantity", `'UNIT', null, null, 'NONE', 1000`],
    ["a zero quantity", `'UNIT', null, null, 'PROPOSED', 0`],
    ["a net content without a unit", `'UNIT', 250, null, 'NONE', null`],
    ["a net content without a quantity", `'UNIT', null, 'ML', 'NONE', null`],
    ["a zero net content", `'UNIT', 0, 'ML', 'NONE', null`],
    ["an unknown sale unit", `'BOX', null, null, 'NONE', null`],
    ["an unknown net content unit", `'UNIT', 1, 'OZ', 'NONE', null`],
  ])("refuses a quantity proposal with %s", async (_name, values) => {
    const { database, rowId } = await databaseHoldingAListWithARow();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into supplier_item_quantity_proposals
           (row_id, asked_description, asked_other_presentations, sale_unit, net_content_quantity, net_content_unit, kind, quantity)
         values ($1, 'Yerba', '{}', ${values})`,
        [rowId],
      ),
    ).rejects.toThrow();
  });

  it.each([
    ["no row description it was asked from", `null, '{}'`],
    ["no row presentations it was asked from", `'Yerba', null`],
  ])("refuses a quantity proposal with %s", async (_name, askedFrom) => {
    const { database, rowId } = await databaseHoldingAListWithARow();
    const migrated = await database.applyMigration();

    await expect(
      migrated.query(
        `insert into supplier_item_quantity_proposals
           (row_id, asked_description, asked_other_presentations, sale_unit, kind)
         values ($1, ${askedFrom}, 'UNIT', 'NONE')`,
        [rowId],
      ),
    ).rejects.toThrow();
  });

  it("drops the proposals with the row", async () => {
    const { database, rowId, productId } = await databaseHoldingAListWithARow();
    const migrated = await database.applyMigration();
    await migrated.query(
      `insert into supplier_item_link_proposals
         (row_id, asked_description, asked_other_presentations, kind, product_id, proposed_by, sale_unit)
       values ($1, 'Yerba', '{}', 'PROPOSED', $2, 'BARCODE', 'UNIT')`,
      [rowId, productId],
    );
    await migrated.query(
      `insert into supplier_item_quantity_proposals
         (row_id, asked_description, asked_other_presentations, sale_unit, kind, quantity)
       values ($1, 'Yerba', '{}', 'UNIT', 'PROPOSED', 12000)`,
      [rowId],
    );

    await migrated.query(`delete from supplier_price_list_rows where id = $1`, [rowId]);

    const { rows: links } = await migrated.query(`select row_id from supplier_item_link_proposals`);
    const { rows: quantities } = await migrated.query(
      `select id from supplier_item_quantity_proposals`,
    );
    expect([links, quantities]).toEqual([[], []]);
  });
});
