import { supplierItemKey } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { TiendistaStoreCatalogs } from "../../purchasing/tiendista-store-catalogs.js";
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

const STORE_CATALOG = {
  source_kind: "WEB_PAGE",
  source_url: "https://tiendista.com/almacen-del-sur",
  file_content_kind: "STORE_CATALOG",
};

const PDF = { source_kind: "PDF", file_name: "lista.pdf", file_content_kind: "PDF" };

async function databaseBefore() {
  const database = await databaseBeforeMigration("_tiendista_presentations_without_price");
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
  const supplier = (name: string) =>
    first(database, "insert into suppliers (name, actor_id) values ($1, $2) returning id", [
      name,
      userId,
    ]);
  const list = async (
    supplierId: string,
    source: Record<string, string>,
    state: { confirmedAt?: string; discardedAt?: string } = {},
  ) => {
    const values: Record<string, unknown> = {
      supplier_id: supplierId,
      location_id: locationId,
      file_byte_size: 1000,
      state: state.discardedAt ? "DISCARDED" : state.confirmedAt ? "REVIEWED" : "EXTRACTED",
      uploaded_at: "2026-10-01T12:00:00Z",
      uploaded_by: userId,
      confirmed_at: state.confirmedAt ?? null,
      confirmed_by: state.confirmedAt ? userId : null,
      discarded_at: state.discardedAt ?? null,
      discarded_by: state.discardedAt ? userId : null,
      ...source,
    };
    const columns = Object.keys(values);
    return first(
      database,
      `insert into supplier_price_lists (${columns.join(", ")})
       values (${columns.map((_column, index) => `$${index + 1}`).join(", ")}) returning id`,
      Object.values(values),
    );
  };
  const listRow = (listId: string, position: number, presentation: string | null) =>
    first(
      database,
      `insert into supplier_price_list_rows (list_id, position, description, presentation, price_cents)
       values ($1, $2, 'Comino molido', $3, 4200000) returning id`,
      [listId, position, presentation],
    );
  const packaging = async (name: string) => {
    const productId = await first(
      database,
      `insert into products (name, category_id, sale_unit) values ($1, $2, 'UNIT') returning id`,
      [`Comino molido ${name}`, categoryId],
    );
    const packagingId = await first(
      database,
      `insert into product_packagings (product_id, name, quantity_per_package, sale_unit, actor_id)
       values ($1, $2, 10000, 'UNIT', $3) returning id`,
      [productId, name, userId],
    );
    return { productId, packagingId };
  };
  const item = (
    supplierId: string,
    keyValue: string,
    link: { productId: string; packagingId: string } | null = null,
    keyKind = "description",
  ) =>
    first(
      database,
      `insert into supplier_items (supplier_id, key_kind, key_value, description, product_id, packaging_id, vat_rate)
       values ($1, $2, $3, 'Comino molido', $4, $5, $6) returning id`,
      [
        supplierId,
        keyKind,
        keyValue,
        link?.productId ?? null,
        link?.packagingId ?? null,
        link ? 2100 : null,
      ],
    );
  const price = (itemId: string, listId: string, priceCents: number, confirmedAt: string) =>
    database.query(
      `insert into supplier_item_prices (item_id, list_id, price_cents, list_date, prices_include_vat, confirmed_at)
       values ($1, $2, $3, $4::timestamptz::date, false, $4::timestamptz)`,
      [itemId, listId, priceCents, confirmedAt],
    );
  return { database, supplier, list, listRow, packaging, item, price };
}

const oldKey = (description: string, unit: string) =>
  supplierItemKey({ code: null, description, presentation: unit }).value;

async function readerKey(description: string, unit: string) {
  const reading = await new TiendistaStoreCatalogs().rows(
    new TextEncoder().encode(JSON.stringify([{ nombre: description, unidad: unit, precio: 1 }])),
  );
  const [row] = reading.kind === "read" ? reading.rows : [];
  if (row === undefined) {
    throw new Error("test setup: expected the reader to read the unit");
  }
  return supplierItemKey(row).value;
}

async function itemsOf(database: Pick<Database, "query">, supplierId: string) {
  const { rows } = await database.query(
    `select id, key_kind, key_value, product_id, packaging_id
     from supplier_items where supplier_id = $1 order by key_value`,
    [supplierId],
  );
  return rows;
}

async function pricesOf(database: Pick<Database, "query">, supplierId: string) {
  const { rows } = await database.query(
    `select p.item_id, p.list_id, p.price_cents
     from supplier_item_prices p join supplier_items i on i.id = p.item_id
     where i.supplier_id = $1 order by p.confirmed_at`,
    [supplierId],
  );
  return rows;
}

describe("the Tiendista presentations without price migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it.each([
    ["Comino molido", "5 kg ($8400 kg)"],
    ["Comino molido", " 5 kg  ( $7900 KG ) "],
    ["Comino molido", "Bolsa x25kg ($3100kg)"],
    ["Comino molido", "Caja x 4 bol ($5200 kg)"],
    ["Comino molido", "800 grs ($12500 kg)"],
    ["Comino molido", "x5kg ($ kg)"],
    ["Comino molido", "x5kg $18600 kg)"],
    ["Comino molido", "x15kg $17850 kg)"],
    ["Comino molido", "Bolsa (5 kg)"],
    ["Comino molido", "($8400 kg)"],
    ["Sal fina", "x5u ($650 c/u)"],
    ["Sal fina", " x5u  ( $700 C/U ) "],
    ["Sal fina", "($650 c/u)"],
    ["Sal fina", " ( $650 C/U ) "],
    ["Sal fina", "Pack (6 u)"],
    ["Sal fina", "Pack x 6"],
  ])("keys the item %j %j as the store catalog reader keys it now", async (description, unit) => {
    const before = await databaseBefore();
    const supplierId = await before.supplier("Almacén del Sur");
    const october = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-10-01T12:00:00Z",
    });
    const itemId = await before.item(supplierId, oldKey(description, unit));
    await before.price(itemId, october, 4200000, "2026-10-01T12:00:00Z");

    const migrated = await before.database.applyMigration();

    expect(await itemsOf(migrated, supplierId)).toEqual([
      expect.objectContaining({ key_value: await readerKey(description, unit) }),
    ]);
  });

  it("merges the old keys of one item into the one linked by the latest confirmed list, keeping every price", async () => {
    const before = await databaseBefore();
    const supplierId = await before.supplier("Almacén del Sur");
    const october = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-10-01T12:00:00Z",
    });
    const november = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-11-01T12:00:00Z",
    });
    const december = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-12-01T12:00:00Z",
    });
    const older = await before.packaging("5 kg ($8400 kg)");
    const newer = await before.packaging("Bolsa 5 kg");
    const olderItem = await before.item(
      supplierId,
      oldKey("Comino molido", "5 kg ($8400 kg)"),
      older,
    );
    const newerItem = await before.item(
      supplierId,
      oldKey("Comino molido", "5 kg ($7900 kg)"),
      newer,
    );
    const unlinkedItem = await before.item(supplierId, oldKey("Comino molido", "5 kg ($8100 kg)"));
    await before.price(olderItem, october, 4200000, "2026-10-01T12:00:00Z");
    await before.price(unlinkedItem, november, 4050000, "2026-11-01T12:00:00Z");
    await before.price(newerItem, december, 3950000, "2026-12-01T12:00:00Z");

    const migrated = await before.database.applyMigration();

    expect(await itemsOf(migrated, supplierId)).toEqual([
      {
        id: newerItem,
        key_kind: "description",
        key_value: "comino molido\n5 kg",
        product_id: newer.productId,
        packaging_id: newer.packagingId,
      },
    ]);
    expect(await pricesOf(migrated, supplierId)).toEqual([
      { item_id: newerItem, list_id: october, price_cents: 4200000 },
      { item_id: newerItem, list_id: november, price_cents: 4050000 },
      { item_id: newerItem, list_id: december, price_cents: 3950000 },
    ]);
  });

  it("merges an old key into the item already recorded under the key without price, when its list is the latest", async () => {
    const before = await databaseBefore();
    const supplierId = await before.supplier("Almacén del Sur");
    const october = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-10-01T12:00:00Z",
    });
    const november = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-11-01T12:00:00Z",
    });
    const current = await before.packaging("Bolsa 5 kg");
    const oldItem = await before.item(supplierId, oldKey("Comino molido", "5 kg ($8400 kg)"));
    const currentItem = await before.item(supplierId, "comino molido\n5 kg", current);
    await before.price(oldItem, october, 4200000, "2026-10-01T12:00:00Z");
    await before.price(currentItem, november, 3950000, "2026-11-01T12:00:00Z");

    const migrated = await before.database.applyMigration();

    expect(await itemsOf(migrated, supplierId)).toEqual([
      expect.objectContaining({ id: currentItem, key_value: "comino molido\n5 kg" }),
    ]);
    expect(await pricesOf(migrated, supplierId)).toEqual([
      { item_id: currentItem, list_id: october, price_cents: 4200000 },
      { item_id: currentItem, list_id: november, price_cents: 3950000 },
    ]);
  });

  it("merges the old keys of one item into the linked one most recently confirmed, even when an unlinked one was confirmed later", async () => {
    const before = await databaseBefore();
    const supplierId = await before.supplier("Almacén del Sur");
    const october = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-10-01T12:00:00Z",
    });
    const november = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-11-01T12:00:00Z",
    });
    const linked = await before.packaging("Bolsa 5 kg");
    const linkedItem = await before.item(
      supplierId,
      oldKey("Comino molido", "5 kg ($8400 kg)"),
      linked,
    );
    const unlinkedItem = await before.item(supplierId, oldKey("Comino molido", "5 kg ($7900 kg)"));
    await before.price(linkedItem, october, 4200000, "2026-10-01T12:00:00Z");
    await before.price(unlinkedItem, november, 3950000, "2026-11-01T12:00:00Z");

    const migrated = await before.database.applyMigration();

    expect(await itemsOf(migrated, supplierId)).toEqual([
      {
        id: linkedItem,
        key_kind: "description",
        key_value: "comino molido\n5 kg",
        product_id: linked.productId,
        packaging_id: linked.packagingId,
      },
    ]);
    expect(await pricesOf(migrated, supplierId)).toEqual([
      { item_id: linkedItem, list_id: october, price_cents: 4200000 },
      { item_id: linkedItem, list_id: november, price_cents: 3950000 },
    ]);
  });

  it("keeps only the latest item's price of a list that priced two old keys of one item", async () => {
    const before = await databaseBefore();
    const supplierId = await before.supplier("Almacén del Sur");
    const october = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-10-01T12:00:00Z",
    });
    const november = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-11-01T12:00:00Z",
    });
    const olderItem = await before.item(supplierId, oldKey("Comino molido", "5 kg ($8400 kg)"));
    const newerItem = await before.item(supplierId, oldKey("Comino molido", "5 kg ($7900 kg)"));
    await before.price(olderItem, october, 4200000, "2026-10-01T12:00:00Z");
    await before.price(newerItem, october, 3950000, "2026-10-01T12:00:00Z");
    await before.price(newerItem, november, 3950000, "2026-11-01T12:00:00Z");

    const migrated = await before.database.applyMigration();

    expect(await pricesOf(migrated, supplierId)).toEqual([
      { item_id: newerItem, list_id: october, price_cents: 3950000 },
      { item_id: newerItem, list_id: november, price_cents: 3950000 },
    ]);
  });

  it("leaves the items of a supplier with no store catalog list, and every item keyed by its code, as they are", async () => {
    const before = await databaseBefore();
    const pdfSupplier = await before.supplier("Distribuidora Ejemplo");
    await before.list(pdfSupplier, PDF);
    const storeSupplier = await before.supplier("Almacén del Sur");
    await before.list(storeSupplier, STORE_CATALOG);
    const pdfItem = await before.item(pdfSupplier, oldKey("Comino molido", "5 kg ($8400 kg)"));
    const codeItem = await before.item(storeSupplier, "C-5 ($8400 kg)", null, "code");

    const migrated = await before.database.applyMigration();

    expect(await itemsOf(migrated, pdfSupplier)).toEqual([
      expect.objectContaining({ id: pdfItem, key_value: "comino molido\n5 kg ($8400 kg)" }),
    ]);
    expect(await itemsOf(migrated, storeSupplier)).toEqual([
      expect.objectContaining({ id: codeItem, key_value: "C-5 ($8400 kg)" }),
    ]);
  });

  it("leaves an item only lists other than a store catalog priced as it is, beside the store catalog items it rekeys", async () => {
    const before = await databaseBefore();
    const supplierId = await before.supplier("Almacén del Sur");
    const storeList = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-10-01T12:00:00Z",
    });
    const pdfList = await before.list(supplierId, PDF, { confirmedAt: "2026-10-02T12:00:00Z" });
    const pdfLink = await before.packaging("5 kg ($8400 kg)");
    const pdfItem = await before.item(
      supplierId,
      oldKey("Comino molido", "5 kg ($8400 kg)"),
      pdfLink,
    );
    const storeItem = await before.item(supplierId, oldKey("Comino molido", "x5u ($650 c/u)"));
    await before.price(pdfItem, pdfList, 4200000, "2026-10-02T12:00:00Z");
    await before.price(storeItem, storeList, 325000, "2026-10-01T12:00:00Z");

    const migrated = await before.database.applyMigration();

    expect(await itemsOf(migrated, supplierId)).toEqual([
      {
        id: pdfItem,
        key_kind: "description",
        key_value: "comino molido\n5 kg ($8400 kg)",
        product_id: pdfLink.productId,
        packaging_id: pdfLink.packagingId,
      },
      expect.objectContaining({ id: storeItem, key_value: "comino molido\nx5u" }),
    ]);
    expect(await pricesOf(migrated, supplierId)).toEqual([
      { item_id: storeItem, list_id: storeList, price_cents: 325000 },
      { item_id: pdfItem, list_id: pdfList, price_cents: 4200000 },
    ]);
  });

  it("merges a store catalog item into the item another list already holds under its key without price, keeping the link and every price", async () => {
    const before = await databaseBefore();
    const supplierId = await before.supplier("Almacén del Sur");
    const october = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-10-01T12:00:00Z",
    });
    const pdfList = await before.list(supplierId, PDF, { confirmedAt: "2026-10-02T12:00:00Z" });
    const storeLink = await before.packaging("Bolsa 5 kg");
    const storeItem = await before.item(
      supplierId,
      oldKey("Comino molido", "5 kg ($8400 kg)"),
      storeLink,
    );
    const pdfItem = await before.item(supplierId, "comino molido\n5 kg");
    await before.price(storeItem, october, 4200000, "2026-10-01T12:00:00Z");
    await before.price(pdfItem, pdfList, 4100000, "2026-10-02T12:00:00Z");

    const migrated = await before.database.applyMigration();

    expect(await itemsOf(migrated, supplierId)).toEqual([
      {
        id: storeItem,
        key_kind: "description",
        key_value: "comino molido\n5 kg",
        product_id: storeLink.productId,
        packaging_id: storeLink.packagingId,
      },
    ]);
    expect(await pricesOf(migrated, supplierId)).toEqual([
      { item_id: storeItem, list_id: october, price_cents: 4200000 },
      { item_id: storeItem, list_id: pdfList, price_cents: 4100000 },
    ]);
  });

  it("merges a store catalog item into the linked item another list holds under its key without price, when that list was confirmed later", async () => {
    const before = await databaseBefore();
    const supplierId = await before.supplier("Almacén del Sur");
    const october = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-10-01T12:00:00Z",
    });
    const pdfList = await before.list(supplierId, PDF, { confirmedAt: "2026-10-02T12:00:00Z" });
    const storeLink = await before.packaging("5 kg ($8400 kg)");
    const pdfLink = await before.packaging("Bolsa 5 kg");
    const storeItem = await before.item(
      supplierId,
      oldKey("Comino molido", "5 kg ($8400 kg)"),
      storeLink,
    );
    const pdfItem = await before.item(supplierId, "comino molido\n5 kg", pdfLink);
    await before.price(storeItem, october, 4200000, "2026-10-01T12:00:00Z");
    await before.price(pdfItem, pdfList, 4100000, "2026-10-02T12:00:00Z");

    const migrated = await before.database.applyMigration();

    expect(await itemsOf(migrated, supplierId)).toEqual([
      {
        id: pdfItem,
        key_kind: "description",
        key_value: "comino molido\n5 kg",
        product_id: pdfLink.productId,
        packaging_id: pdfLink.packagingId,
      },
    ]);
    expect(await pricesOf(migrated, supplierId)).toEqual([
      { item_id: pdfItem, list_id: october, price_cents: 4200000 },
      { item_id: pdfItem, list_id: pdfList, price_cents: 4100000 },
    ]);
  });

  it("takes the price out of the rows of a store catalog list still under review, and of no other list", async () => {
    const before = await databaseBefore();
    const supplierId = await before.supplier("Almacén del Sur");
    const underReview = await before.list(supplierId, STORE_CATALOG);
    const confirmed = await before.list(supplierId, STORE_CATALOG, {
      confirmedAt: "2026-10-01T12:00:00Z",
    });
    const discarded = await before.list(supplierId, STORE_CATALOG, {
      discardedAt: "2026-10-01T12:00:00Z",
    });
    const pdf = await before.list(supplierId, PDF);
    const units = ["5 kg ($8400 kg)", "x15kg $17850 kg)", "Bolsa (5 kg)", "($8400 kg)", null];
    for (const [position, unit] of units.entries()) {
      for (const listId of [underReview, confirmed, discarded, pdf]) {
        await before.listRow(listId, position, unit);
      }
    }

    const migrated = await before.database.applyMigration();

    const presentationsOf = async (listId: string) => {
      const { rows } = await migrated.query<{ presentation: string | null }>(
        "select presentation from supplier_price_list_rows where list_id = $1 order by position",
        [listId],
      );
      return rows.map(({ presentation }) => presentation);
    };
    expect(await presentationsOf(underReview)).toEqual([
      "5 kg",
      "x15kg",
      "Bolsa (5 kg)",
      null,
      null,
    ]);
    for (const listId of [confirmed, discarded, pdf]) {
      expect(await presentationsOf(listId)).toEqual(units);
    }
  });
});
