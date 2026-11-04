import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function firstId(database: SqlOnlyDatabase, sql: string, values: unknown[] = []) {
  const { rows } = await database.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("test setup: seeding returned no row");
  }
  return id;
}

async function seededOrders(database: SqlOnlyDatabase) {
  const locationId = await firstId(database, "select id from locations limit 1");
  const userId = await firstId(
    database,
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  const supplierId = await firstId(
    database,
    "insert into suppliers (name, actor_id) values ('Distribuidora Sur', $1) returning id",
    [userId],
  );
  const draftId = await firstId(
    database,
    `insert into purchase_orders (supplier_id, location_id, state, created_at, actor_id)
     values ($1, $2, 'DRAFT', '2026-10-20T10:00:00Z', $3) returning id`,
    [supplierId, locationId, userId],
  );
  const sentId = await firstId(
    database,
    `insert into purchase_orders (supplier_id, location_id, state, created_at, actor_id, sent_at, sent_by)
     values ($1, $2, 'SENT', '2026-10-21T10:00:00Z', $3, '2026-10-21T11:00:00Z', $3) returning id`,
    [supplierId, locationId, userId],
  );
  const cancelledId = await firstId(
    database,
    `insert into purchase_orders (supplier_id, location_id, state, created_at, actor_id, cancelled_at, cancelled_by)
     values ($1, $2, 'CANCELLED', '2026-10-22T10:00:00Z', $3, '2026-10-22T11:00:00Z', $3) returning id`,
    [supplierId, locationId, userId],
  );
  return { draftId, sentId, cancelledId, userId, supplierId, locationId };
}

async function seededLines(database: SqlOnlyDatabase) {
  const orders = await seededOrders(database);
  const categoryId = await firstId(
    database,
    "insert into categories (name) values ('Almacen') returning id",
  );
  const lineIds: string[] = [];
  for (const [index, name] of ["Yerba", "Azucar"].entries()) {
    const productId = await firstId(
      database,
      "insert into products (name, category_id, sale_unit) values ($1, $2, 'UNIT') returning id",
      [name, categoryId],
    );
    lineIds.push(
      await firstId(
        database,
        `insert into purchase_order_lines (purchase_order_id, position, product_id, packages, quantity_per_package)
         values ($1, $2, $3, 3, 12000) returning id`,
        [orders.sentId, index + 1, productId],
      ),
    );
  }
  const purchaseId = await firstId(
    database,
    `insert into purchases (supplier_id, location_id, purchased_on, receipt_type, recorded_at, actor_id)
     values ($1, $2, '2026-10-25', 'sin_comprobante', '2026-10-25T10:00:00Z', $3) returning id`,
    [orders.supplierId, orders.locationId, orders.userId],
  );
  return { ...orders, lineIds, purchaseId };
}

async function acceptsOrRefuses(database: SqlOnlyDatabase, sql: string, values: unknown[]) {
  try {
    await database.query(sql, values);
    return "accepted";
  } catch {
    return "refused";
  }
}

describe("the purchase order receipts migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the draft, sent and cancelled orders it finds, none of them received", async () => {
    const database = await databaseBeforeMigration("_purchase_order_receipts");
    const { draftId, sentId, cancelledId } = await seededOrders(database);

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select id, state, sent_at is not null as sent, cancelled_at is not null as cancelled, received_at from purchase_orders order by created_at",
    );
    expect(rows).toEqual([
      { id: draftId, state: "DRAFT", sent: false, cancelled: false, received_at: null },
      { id: sentId, state: "SENT", sent: true, cancelled: false, received_at: null },
      { id: cancelledId, state: "CANCELLED", sent: false, cancelled: true, received_at: null },
    ]);
  });

  it("lets a sent order be received in part and then in full", async () => {
    const database = await databaseBeforeMigration("_purchase_order_receipts");
    const { sentId } = await seededOrders(database);
    const migrated = await database.applyMigration();

    await migrated.query("update purchase_orders set state = 'PARTIALLY_RECEIVED' where id = $1", [
      sentId,
    ]);
    await migrated.query(
      "update purchase_orders set state = 'RECEIVED', received_at = '2026-10-25T10:00:00Z' where id = $1",
      [sentId],
    );

    const { rows } = await migrated.query(
      "select state, received_at from purchase_orders where id = $1",
      [sentId],
    );
    expect(rows).toEqual([{ state: "RECEIVED", received_at: new Date("2026-10-25T10:00:00Z") }]);
  });

  it("lets an order received in part be cancelled without a receipt date", async () => {
    const database = await databaseBeforeMigration("_purchase_order_receipts");
    const { sentId, userId } = await seededOrders(database);
    const migrated = await database.applyMigration();
    await migrated.query("update purchase_orders set state = 'PARTIALLY_RECEIVED' where id = $1", [
      sentId,
    ]);

    await migrated.query(
      "update purchase_orders set state = 'CANCELLED', cancelled_at = '2026-10-26T10:00:00Z', cancelled_by = $2 where id = $1",
      [sentId, userId],
    );

    const { rows } = await migrated.query(
      "select state, received_at from purchase_orders where id = $1",
      [sentId],
    );
    expect(rows).toEqual([{ state: "CANCELLED", received_at: null }]);
  });

  it("refuses a received state that does not match the order's sending and receiving dates", async () => {
    const database = await databaseBeforeMigration("_purchase_order_receipts");
    const { draftId, sentId } = await seededOrders(database);
    const migrated = await database.applyMigration();

    expect({
      receivedWithoutDate: await acceptsOrRefuses(
        migrated,
        "update purchase_orders set state = 'RECEIVED' where id = $1",
        [sentId],
      ),
      dateWithoutReceived: await acceptsOrRefuses(
        migrated,
        "update purchase_orders set received_at = '2026-10-25T10:00:00Z' where id = $1",
        [sentId],
      ),
      partiallyReceivedNeverSent: await acceptsOrRefuses(
        migrated,
        "update purchase_orders set state = 'PARTIALLY_RECEIVED' where id = $1",
        [draftId],
      ),
      receivedNeverSent: await acceptsOrRefuses(
        migrated,
        "update purchase_orders set state = 'RECEIVED', received_at = '2026-10-25T10:00:00Z' where id = $1",
        [draftId],
      ),
    }).toEqual({
      receivedWithoutDate: "refused",
      dateWithoutReceived: "refused",
      partiallyReceivedNeverSent: "refused",
      receivedNeverSent: "refused",
    });
  });

  it("records a receipt of an order's line and its differences", async () => {
    const database = await databaseBeforeMigration("_purchase_order_receipts");
    const { sentId, userId, purchaseId, lineIds } = await seededLines(database);
    const migrated = await database.applyMigration();

    const receiptId = await firstId(
      migrated,
      `insert into purchase_order_receipts (purchase_order_id, purchase_id, actor_id, received_at)
       values ($1, $2, $3, '2026-10-25T10:00:00Z') returning id`,
      [sentId, purchaseId, userId],
    );
    await migrated.query(
      `insert into purchase_order_receipt_lines
         (purchase_order_receipt_id, purchase_order_line_id, received_quantity, missing_quantity, price_difference_cents)
       values ($1, $2, 24000, 12000, -150)`,
      [receiptId, lineIds[0]],
    );

    const { rows } = await migrated.query(
      "select received_quantity, missing_quantity, price_difference_cents from purchase_order_receipt_lines",
    );
    expect(rows).toEqual([
      { received_quantity: 24_000, missing_quantity: 12_000, price_difference_cents: -150 },
    ]);
  });

  it("refuses a second receipt of one purchase and a second row for one line", async () => {
    const database = await databaseBeforeMigration("_purchase_order_receipts");
    const { sentId, userId, purchaseId, lineIds } = await seededLines(database);
    const migrated = await database.applyMigration();
    const receiptId = await firstId(
      migrated,
      `insert into purchase_order_receipts (purchase_order_id, purchase_id, actor_id, received_at)
       values ($1, $2, $3, '2026-10-25T10:00:00Z') returning id`,
      [sentId, purchaseId, userId],
    );
    const insertLine = `insert into purchase_order_receipt_lines (purchase_order_receipt_id, purchase_order_line_id, received_quantity, missing_quantity)
       values ($1, $2, 1000, 0)`;
    await migrated.query(insertLine, [receiptId, lineIds[0]]);

    expect({
      secondReceiptOfOnePurchase: await acceptsOrRefuses(
        migrated,
        `insert into purchase_order_receipts (purchase_order_id, purchase_id, actor_id, received_at)
         values ($1, $2, $3, '2026-10-26T10:00:00Z')`,
        [sentId, purchaseId, userId],
      ),
      secondRowForOneLine: await acceptsOrRefuses(migrated, insertLine, [receiptId, lineIds[0]]),
    }).toEqual({ secondReceiptOfOnePurchase: "refused", secondRowForOneLine: "refused" });
  });

  it("refuses a negative received or missing quantity", async () => {
    const database = await databaseBeforeMigration("_purchase_order_receipts");
    const { sentId, userId, purchaseId, lineIds } = await seededLines(database);
    const migrated = await database.applyMigration();
    const receiptId = await firstId(
      migrated,
      `insert into purchase_order_receipts (purchase_order_id, purchase_id, actor_id, received_at)
       values ($1, $2, $3, '2026-10-25T10:00:00Z') returning id`,
      [sentId, purchaseId, userId],
    );
    const insertLine = `insert into purchase_order_receipt_lines (purchase_order_receipt_id, purchase_order_line_id, received_quantity, missing_quantity)
       values ($1, $2, $3, $4)`;

    expect({
      negativeReceived: await acceptsOrRefuses(migrated, insertLine, [
        receiptId,
        lineIds[0],
        -1,
        0,
      ]),
      negativeMissing: await acceptsOrRefuses(migrated, insertLine, [receiptId, lineIds[1], 0, -1]),
      zeroes: await acceptsOrRefuses(migrated, insertLine, [receiptId, lineIds[1], 0, 0]),
    }).toEqual({ negativeReceived: "refused", negativeMissing: "refused", zeroes: "accepted" });
  });
});
