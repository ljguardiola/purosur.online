import { PURCHASE_ORDER_STATES } from "@purosur/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePendingPurchaseOrdersReader } from "./drizzle-pending-purchase-orders-reader.js";
import { insertOrderRow } from "./test-support/pending-purchase-orders-fixtures.js";
import { insertSupplier } from "./test-support/purchases-report-fixtures.js";

const NOW = new Date("2026-10-20T15:00:00.000Z");
const october = { from: "2026-10-01", to: "2026-10-31" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function setUp() {
  const { userId: actorId, locationId } = await signedInWith(db, [], NOW);
  const { productId } = await insertProduct(db);
  const supplierId = await insertSupplier(db, { actorId, name: "Distribuidora Sur" });
  return { actorId, locationId, productId, supplierId };
}

describe("DrizzlePendingPurchaseOrdersReader.ordersPendingReceipt", () => {
  it("answers only the orders sent or partially received, whatever the state of the others", async () => {
    const context = await setUp();
    const ids: Record<string, string> = {};
    for (const state of PURCHASE_ORDER_STATES) {
      ids[state] = await insertOrderRow(db, { ...context, state });
    }

    const rows = await new DrizzlePendingPurchaseOrdersReader(db).ordersPendingReceipt({
      locationId: context.locationId,
      range: october,
    });

    expect(rows.map((row) => row.orderId).sort()).toEqual(
      [ids.SENT, ids.PARTIALLY_RECEIVED].sort(),
    );
    expect(rows.map((row) => row.state).sort()).toEqual(["PARTIALLY_RECEIVED", "SENT"]);
  });

  it("answers each order with its supplier, its sending instant and its priced lines", async () => {
    const context = await setUp();
    const sentAt = new Date("2026-10-12T15:00:00.000Z");
    const orderId = await insertOrderRow(db, {
      ...context,
      state: "SENT",
      sentAt,
      lines: [{ packages: 3, expectedPackagePriceCents: 2_500 }],
    });

    const rows = await new DrizzlePendingPurchaseOrdersReader(db).ordersPendingReceipt({
      locationId: context.locationId,
      range: october,
    });

    expect(rows).toEqual([
      {
        orderId,
        supplierId: context.supplierId,
        supplierName: "Distribuidora Sur",
        state: "SENT",
        sentAt,
        lines: [{ packages: 3, expectedPackagePriceCents: 2_500 }],
      },
    ]);
  });

  it("includes the orders sent on the first and on the last Argentina day of the range", async () => {
    const context = await setUp();
    const first = await insertOrderRow(db, {
      ...context,
      state: "SENT",
      sentAt: new Date("2026-10-01T03:10:00.000Z"),
    });
    const last = await insertOrderRow(db, {
      ...context,
      state: "SENT",
      sentAt: new Date("2026-11-01T02:30:00.000Z"),
    });

    const rows = await new DrizzlePendingPurchaseOrdersReader(db).ordersPendingReceipt({
      locationId: context.locationId,
      range: october,
    });

    expect(rows.map((row) => row.orderId).sort()).toEqual([first, last].sort());
  });

  it("leaves out the orders sent on the Argentina days around the range", async () => {
    const context = await setUp();
    await insertOrderRow(db, {
      ...context,
      state: "SENT",
      sentAt: new Date("2026-10-01T02:50:00.000Z"),
    });
    await insertOrderRow(db, {
      ...context,
      state: "SENT",
      sentAt: new Date("2026-11-01T03:10:00.000Z"),
    });

    const rows = await new DrizzlePendingPurchaseOrdersReader(db).ordersPendingReceipt({
      locationId: context.locationId,
      range: october,
    });

    expect(rows).toEqual([]);
  });

  it("leaves out the orders of another branch", async () => {
    const context = await setUp();
    await insertOrderRow(db, {
      ...context,
      locationId: await insertLocation(db),
      state: "SENT",
    });

    const rows = await new DrizzlePendingPurchaseOrdersReader(db).ordersPendingReceipt({
      locationId: context.locationId,
      range: october,
    });

    expect(rows).toEqual([]);
  });
});
