import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const MISSING_ID = "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f";

async function databaseBefore() {
  const database = await databaseBeforeMigration("_purchases_and_lots");
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await database.query<{ id: string }>(sql, params);
    return rows[0]?.id as string;
  };
  const locationId = await first("select id from locations limit 1");
  const categoryId = await first("insert into categories (name) values ('Almacen') returning id");
  const productId = await first(
    "insert into products (name, category_id, sale_unit) values ('Yerba', $1, 'UNIT') returning id",
    [categoryId],
  );
  const userId = await first(
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  return { database, productId, locationId, userId, first };
}

describe("the purchases and lots migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded movement, none of them tied to a purchase line", async () => {
    const { database, productId, locationId, userId } = await databaseBefore();
    await database.query(
      `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id)
       values ($1, $2, 'loss', 'broken_or_spilled', -1000, now(), $3), ($1, $2, 'count', null, 0, now(), $3)`,
      [productId, locationId, userId],
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select kind, reason, delta, purchase_line_id from stock_movements order by kind",
    );
    expect(rows).toEqual([
      { kind: "count", reason: null, delta: 0, purchase_line_id: null },
      { kind: "loss", reason: "broken_or_spilled", delta: -1000, purchase_line_id: null },
    ]);
  });

  async function migratedWithPurchaseLine() {
    const { database, first, productId, locationId, userId } = await databaseBefore();
    const migrated = await database.applyMigration();
    const supplierId = await first(
      "insert into suppliers (name, actor_id) values ('Distribuidora Sur', $1) returning id",
      [userId],
    );
    const purchaseId = await first(
      `insert into purchases (supplier_id, location_id, purchased_on, receipt_type, recorded_at, actor_id)
       values ($1, $2, '2026-10-01', 'sin_comprobante', now(), $3) returning id`,
      [supplierId, locationId, userId],
    );
    const purchaseLineId = await first(
      `insert into purchase_lines (purchase_id, position, product_id, quantity, cost_paid_cents, quantity_per_package)
       values ($1, 1, $2, 1000, 500, 1000) returning id`,
      [purchaseId, productId],
    );
    const insertReceipt = (reason: string | null, lineId: string | null) =>
      migrated.query(
        `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id, purchase_line_id)
         values ($1, $2, 'receipt', $3, 1000, now(), $4, $5)`,
        [productId, locationId, reason, userId, lineId],
      );
    return { migrated, productId, locationId, userId, purchaseLineId, insertReceipt };
  }

  it("records a purchase line's receipt movement against it, with no reason", async () => {
    const { migrated, purchaseLineId, insertReceipt } = await migratedWithPurchaseLine();

    await insertReceipt(null, purchaseLineId);

    const { rows } = await migrated.query(
      "select kind, reason, purchase_line_id from stock_movements",
    );
    expect(rows).toEqual([{ kind: "receipt", reason: null, purchase_line_id: purchaseLineId }]);
  });

  it("refuses a receipt movement with a reason, without a purchase line, or of a line that does not exist", async () => {
    const { purchaseLineId, insertReceipt } = await migratedWithPurchaseLine();

    await expect(insertReceipt("broken_or_spilled", purchaseLineId)).rejects.toThrow(
      /stock_movements_reason_unless_count_sale_or_receipt_check/,
    );
    await expect(insertReceipt(null, null)).rejects.toThrow(
      /stock_movements_purchase_line_iff_receipt_check/,
    );
    await expect(insertReceipt(null, MISSING_ID)).rejects.toThrow(
      /stock_movements_purchase_line_id_purchase_lines_id_fk/,
    );
  });

  it("refuses a purchase line on a movement that is not a receipt", async () => {
    const { migrated, purchaseLineId, productId, locationId, userId } =
      await migratedWithPurchaseLine();

    await expect(
      migrated.query(
        `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id, purchase_line_id)
         values ($1, $2, 'loss', 'broken_or_spilled', -1000, now(), $3, $4)`,
        [productId, locationId, userId, purchaseLineId],
      ),
    ).rejects.toThrow(/stock_movements_purchase_line_iff_receipt_check/);
  });
});
