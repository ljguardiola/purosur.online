import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const EXTRACTED_AT = "2026-03-01T12:05:00Z";
const BEFORE_EXTRACTION = "2026-03-01T11:00:00Z";

async function databaseHoldingAReviewedList() {
  const database = await databaseBeforeMigration("_supplier_price_list_row_page_prices");
  const { rows: users } = await database.query<{ id: string; location_id: string }>(
    `insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning id, location_id`,
  );
  const userId = users[0]?.id as string;
  const locationId = users[0]?.location_id as string;
  const { rows: suppliers } = await database.query<{ id: string }>(
    `insert into suppliers (name, actor_id) values ('Distribuidora Ejemplo', $1) returning id`,
    [userId],
  );
  const { rows: lists } = await database.query<{ id: string }>(
    `insert into supplier_price_lists
       (supplier_id, location_id, source_kind, source_url, file_content_kind, file_byte_size, state, uploaded_at, uploaded_by, sent_at, sent_on, extracted_at)
     values ($1, $2, 'WEB_PAGE', 'https://distribuidora-sur.example/catalogo', 'STORE_CATALOG', 1000, 'EXTRACTED', '2026-03-01T12:00:00Z', $3, '2026-03-01T12:01:00Z', '2026-03-01', $4)
     returning id`,
    [suppliers[0]?.id, locationId, userId, EXTRACTED_AT],
  );
  const listId = lists[0]?.id as string;

  async function addRow(position: number, description: string, priceCents: number | null) {
    const { rows } = await database.query<{ id: string }>(
      `insert into supplier_price_list_rows (list_id, position, description, price_cents)
       values ($1, $2, $3, $4) returning id`,
      [listId, position, description, priceCents],
    );
    return rows[0]?.id as string;
  }

  function audit(
    rowId: string,
    at: string,
    previousValue: object | null,
    newValue: object | null,
    entity = "supplier_price_list_row",
  ) {
    return database.query(
      `insert into audit_log (entity, entity_id, actor_id, at, previous_value, new_value)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
      [
        entity,
        rowId,
        userId,
        at,
        previousValue && JSON.stringify(previousValue),
        newValue && JSON.stringify(newValue),
      ],
    );
  }

  return { database, userId, listId, addRow, audit };
}

async function pagePrices(
  migrated: { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  listId: string,
) {
  const { rows } = await migrated.query<{
    description: string;
    price_cents: string | null;
    page_price_cents: string | null;
  }>(
    `select description, price_cents, page_price_cents from supplier_price_list_rows where list_id = $1 order by position`,
    [listId],
  );
  return rows.map((row) => ({
    description: row.description,
    price: row.price_cents === null ? null : Number(row.price_cents),
    pagePrice: row.page_price_cents === null ? null : Number(row.page_price_cents),
  }));
}

describe("the page prices of supplier price list rows migration applied over a database that already holds rows", {
  timeout: 30_000,
}, () => {
  it("gives a row nobody changed the price of the page price it has", async () => {
    const { database, listId, addRow } = await databaseHoldingAReviewedList();
    await addRow(0, "Yerba mate 1 kg", 450000);
    await addRow(1, "Azúcar 1 kg", null);

    const migrated = await database.applyMigration();

    expect(await pagePrices(migrated, listId)).toEqual([
      { description: "Yerba mate 1 kg", price: 450000, pagePrice: 450000 },
      { description: "Azúcar 1 kg", price: null, pagePrice: null },
    ]);
  });

  it("gives a row whose price was typed the price it held before the earliest typing since the list was read", async () => {
    const { database, listId, addRow, audit } = await databaseHoldingAReviewedList();
    const overPrinted = await addRow(0, "Yerba mate 1 kg", 600000);
    const overNone = await addRow(1, "Azúcar 1 kg", 120000);
    await audit(
      overPrinted,
      "2026-03-02T10:00:00Z",
      { priceCents: 450000 },
      { priceCents: 500000 },
    );
    await audit(
      overPrinted,
      "2026-03-02T11:00:00Z",
      { priceCents: 500000 },
      { priceCents: 600000 },
    );
    await audit(overNone, "2026-03-02T10:00:00Z", { priceCents: null }, { priceCents: 120000 });

    const migrated = await database.applyMigration();

    expect(await pagePrices(migrated, listId)).toEqual([
      { description: "Yerba mate 1 kg", price: 600000, pagePrice: 450000 },
      { description: "Azúcar 1 kg", price: 120000, pagePrice: null },
    ]);
  });

  it("ignores a price typed before the list was last read, which that reading overwrote", async () => {
    const { database, listId, addRow, audit } = await databaseHoldingAReviewedList();
    const rowId = await addRow(0, "Yerba mate 1 kg", 450000);
    await audit(rowId, BEFORE_EXTRACTION, { priceCents: 300000 }, { priceCents: 350000 });

    const migrated = await database.applyMigration();

    expect(await pagePrices(migrated, listId)).toEqual([
      { description: "Yerba mate 1 kg", price: 450000, pagePrice: 450000 },
    ]);
  });

  it("ignores the entries that are not price edits and those of other entities", async () => {
    const { database, listId, addRow, audit } = await databaseHoldingAReviewedList();
    const rowId = await addRow(0, "Yerba mate 1 kg", 450000);
    await audit(rowId, "2026-03-02T09:00:00Z", { reviewed: false }, { reviewed: true });
    await audit(rowId, "2026-03-02T09:01:00Z", { productId: null }, { productId: "x" });
    await audit(
      rowId,
      "2026-03-02T09:02:00Z",
      { description: "Yerba mate 1 kg", priceCents: 1 },
      null,
    );
    await audit(rowId, "2026-03-02T09:03:00Z", { priceCents: 1 }, { priceCents: 2 }, "product");

    const migrated = await database.applyMigration();

    expect(await pagePrices(migrated, listId)).toEqual([
      { description: "Yerba mate 1 kg", price: 450000, pagePrice: 450000 },
    ]);
  });

  it("leaves the removed items with the price they hold", async () => {
    const { database, listId } = await databaseHoldingAReviewedList();
    await database.query(
      `insert into supplier_price_list_removed_items (list_id, key_kind, key_value, price_cents)
       values ($1, 'code', 'YM1', 450000)`,
      [listId],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ key_value: string; price_cents: string }>(
      `select key_value, price_cents from supplier_price_list_removed_items where list_id = $1`,
      [listId],
    );
    expect(rows.map((row) => ({ ...row, price_cents: Number(row.price_cents) }))).toEqual([
      { key_value: "YM1", price_cents: 450000 },
    ]);
  });
});
