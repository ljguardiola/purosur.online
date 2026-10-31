import { isLinkCurrent, supplierOfferPrice } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

type Database = Awaited<ReturnType<typeof databaseBeforeMigration>>;

async function first(database: Database, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await database.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("test setup: the insert returned no row");
  }
  return id;
}

interface Linked {
  rowId: string;
  itemId: string;
  productId: string;
  packagingId: string;
}

async function databaseHoldingLinks() {
  const database = await databaseBeforeMigration("_link_by_quantity");
  const userId = await first(
    database,
    `insert into users (first_name, email, location_id)
     values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning id`,
  );
  const locationId = await first(database, "select location_id as id from users where id = $1", [
    userId,
  ]);
  const categoryId = await first(
    database,
    "insert into categories (name) values ('Almacén') returning id",
  );
  const supplierId = await first(
    database,
    "insert into suppliers (name, actor_id) values ('Distribuidora Ejemplo', $1) returning id",
    [userId],
  );
  const listId = await first(
    database,
    `insert into supplier_price_lists
       (supplier_id, location_id, source_kind, file_name, file_content_kind, file_byte_size, state, uploaded_at, uploaded_by)
     values ($1, $2, 'PDF', 'lista.pdf', 'PDF', 1000, 'EXTRACTED', '2026-03-01T12:00:00Z', $3) returning id`,
    [supplierId, locationId, userId],
  );
  let position = 0;
  const linked = async (
    name: string,
    productSaleUnit: "UNIT" | "KG",
    packaging: { quantity: number; saleUnit: "UNIT" | "KG"; active: boolean },
  ): Promise<Linked> => {
    const productId = await first(
      database,
      "insert into products (name, category_id, sale_unit) values ($1, $2, $3) returning id",
      [name, categoryId, productSaleUnit],
    );
    const packagingId = await first(
      database,
      `insert into product_packagings (product_id, name, quantity_per_package, sale_unit, active, actor_id)
       values ($1, 'Caja', $2, $3, $4, $5) returning id`,
      [productId, packaging.quantity, packaging.saleUnit, packaging.active, userId],
    );
    const rowId = await first(
      database,
      `insert into supplier_price_list_rows (list_id, position, description, price_cents, product_id, packaging_id, vat_rate)
       values ($1, $2, $3, 6000, $4, $5, 2100) returning id`,
      [listId, position++, name, productId, packagingId],
    );
    const itemId = await first(
      database,
      `insert into supplier_items (supplier_id, key_kind, key_value, description, product_id, packaging_id, vat_rate)
       values ($1, 'description', $2, $2, $3, $4, 2100) returning id`,
      [supplierId, name, productId, packagingId],
    );
    return { rowId, itemId, productId, packagingId };
  };
  const active = await linked("Yerba", "UNIT", {
    quantity: 12_000,
    saleUnit: "UNIT",
    active: true,
  });
  const deactivated = await linked("Azúcar", "UNIT", {
    quantity: 6_000,
    saleUnit: "UNIT",
    active: false,
  });
  const saleUnitChanged = await linked("Harina", "KG", {
    quantity: 5_000,
    saleUnit: "UNIT",
    active: true,
  });
  const unlinkedRowId = await first(
    database,
    `insert into supplier_price_list_rows (list_id, position, description, price_cents)
     values ($1, $2, 'Sal', 900) returning id`,
    [listId, position++],
  );
  const unlinkedItemId = await first(
    database,
    `insert into supplier_items (supplier_id, key_kind, key_value, description)
     values ($1, 'description', 'sal', 'Sal') returning id`,
    [supplierId],
  );
  return {
    database,
    active,
    deactivated,
    saleUnitChanged,
    unlinkedRowId,
    unlinkedItemId,
  };
}

interface StoredLink {
  quantity: string | null;
  sale_unit: string | null;
  relink_required: boolean;
}

async function linkOf(
  database: { query: Database["query"] },
  table: "supplier_price_list_rows" | "supplier_items",
  id: string,
): Promise<StoredLink | undefined> {
  const { rows } = await database.query<StoredLink>(
    `select quantity::text as quantity, sale_unit, relink_required from ${table} where id = $1`,
    [id],
  );
  return rows[0];
}

describe("the link by quantity migration applied over links that refer to packagings", {
  timeout: 30_000,
}, () => {
  it.each([
    ["supplier_price_list_rows", "rowId"],
    ["supplier_items", "itemId"],
  ] as const)("gives each link of %s the quantity of its packaging", async (table, key) => {
    const { database, active, deactivated, saleUnitChanged } = await databaseHoldingLinks();
    const migrated = await database.applyMigration();

    expect(await linkOf(migrated, table, active[key])).toEqual({
      quantity: "12000",
      sale_unit: "UNIT",
      relink_required: false,
    });
    expect(await linkOf(migrated, table, deactivated[key])).toEqual({
      quantity: "6000",
      sale_unit: "UNIT",
      relink_required: true,
    });
    expect(await linkOf(migrated, table, saleUnitChanged[key])).toEqual({
      quantity: "5000",
      sale_unit: "UNIT",
      relink_required: false,
    });
  });

  it("keeps the price per sale unit of an active link and the outdated state of the others", async () => {
    const { database, active, deactivated, saleUnitChanged } = await databaseHoldingLinks();
    const migrated = await database.applyMigration();
    const offerOf = async (linked: Linked, productSaleUnit: "UNIT" | "KG") => {
      const link = await linkOf(migrated, "supplier_items", linked.itemId);
      return supplierOfferPrice(
        {
          link: {
            quantity: Number(link?.quantity),
            saleUnit: link?.sale_unit === "KG" ? "KG" : "UNIT",
            relinkRequired: link?.relink_required ?? false,
          },
          priceCents: 6_000,
          pricesIncludeVat: true,
          vatRate: null,
        },
        productSaleUnit,
      );
    };

    expect(await offerOf(active, "UNIT")).toEqual({
      kind: "priced",
      pricePerSaleUnit: { numerator: 500n, denominator: 1n },
    });
    expect(await offerOf(deactivated, "UNIT")).toEqual({
      kind: "unpriced",
      reason: "link_outdated",
    });
    expect(await offerOf(saleUnitChanged, "KG")).toEqual({
      kind: "unpriced",
      reason: "link_outdated",
    });
    expect(isLinkCurrent({ relinkRequired: false, saleUnit: "UNIT" }, "KG")).toBe(false);
  });

  it("leaves an unlinked row and item without a quantity", async () => {
    const { database, unlinkedRowId, unlinkedItemId } = await databaseHoldingLinks();
    const migrated = await database.applyMigration();

    const empty = { quantity: null, sale_unit: null, relink_required: false };
    expect(await linkOf(migrated, "supplier_price_list_rows", unlinkedRowId)).toEqual(empty);
    expect(await linkOf(migrated, "supplier_items", unlinkedItemId)).toEqual(empty);
  });

  it.each(["supplier_price_list_rows", "supplier_items"] as const)(
    "requires a linked product of %s to state its quantity and sale unit, both positive and known",
    async (table) => {
      const { database, unlinkedRowId, unlinkedItemId, active } = await databaseHoldingLinks();
      const migrated = await database.applyMigration();
      const id = table === "supplier_items" ? unlinkedItemId : unlinkedRowId;
      const link = (quantity: number | null, saleUnit: string | null) =>
        migrated.query(
          `update ${table} set product_id = $2, quantity = $3, sale_unit = $4 where id = $1`,
          [id, active.productId, quantity, saleUnit],
        );

      await expect(link(null, null)).rejects.toThrow();
      await expect(link(0, "UNIT")).rejects.toThrow();
      await expect(link(1_000, null)).rejects.toThrow();
      await expect(link(1_000, "BOX")).rejects.toThrow();
      await expect(link(1_000, "UNIT")).resolves.toBeDefined();
    },
  );

  it.each(["supplier_price_list_rows", "supplier_items"] as const)(
    "keeps no quantity on a row of %s that has no product",
    async (table) => {
      const { database, unlinkedRowId, unlinkedItemId } = await databaseHoldingLinks();
      const migrated = await database.applyMigration();
      const id = table === "supplier_items" ? unlinkedItemId : unlinkedRowId;

      await migrated.query(
        `update ${table} set quantity = 1000, sale_unit = 'UNIT', relink_required = true where id = $1`,
        [id],
      );

      expect(await linkOf(migrated, table, id)).toEqual({
        quantity: null,
        sale_unit: null,
        relink_required: false,
      });
    },
  );
});
