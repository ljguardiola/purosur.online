import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleReceiptDifferencesReader } from "./drizzle-receipt-differences-reader.js";
import { insertSupplier } from "./test-support/purchases-report-fixtures.js";
import { insertReceivedOrder } from "./test-support/receipt-differences-fixtures.js";

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
  const { productId } = await insertProduct(db, {
    name: "Yerba mate",
    brandName: "Taragui",
    netContent: { quantity: 500, unit: "G" },
  });
  const supplierId = await insertSupplier(db, { actorId, name: "Distribuidora Sur" });
  return { actorId, locationId, productId, supplierId };
}

describe("DrizzleReceiptDifferencesReader.receiptLines", () => {
  it("answers each receipt line with its receipt, order, supplier, day, product and recorded figures", async () => {
    const context = await setUp();
    const { orderId, receiptId } = await insertReceivedOrder(db, {
      ...context,
      receivedAt: new Date("2026-10-12T15:00:00.000Z"),
      lines: [{ receivedQuantity: 6_000, missingQuantity: 4_000, priceDifferenceCents: -120 }],
    });

    const rows = await new DrizzleReceiptDifferencesReader(db).receiptLines({
      locationId: context.locationId,
      range: october,
    });

    expect(rows).toEqual([
      {
        receiptId,
        orderId,
        supplierId: context.supplierId,
        supplierName: "Distribuidora Sur",
        receivedOn: "2026-10-12",
        product: {
          id: context.productId,
          name: "Yerba mate",
          brandName: "Taragui",
          netContent: { quantity: 500, unit: "G" },
          saleUnit: "UNIT",
        },
        receivedQuantity: 6_000,
        missingQuantity: 4_000,
        priceDifferenceCents: -120,
      },
    ]);
  });

  it("answers the lines without a difference too, leaving the choice to the domain", async () => {
    const context = await setUp();
    const receivedAt = new Date("2026-10-12T15:00:00.000Z");
    const lines = (priceDifferenceCents: number | null) => [
      { receivedQuantity: 10_000, missingQuantity: 0, priceDifferenceCents },
    ];
    await insertReceivedOrder(db, { ...context, receivedAt, lines: lines(null) });
    await insertReceivedOrder(db, { ...context, receivedAt, lines: lines(0) });

    const rows = await new DrizzleReceiptDifferencesReader(db).receiptLines({
      locationId: context.locationId,
      range: october,
    });

    expect(rows.map((row) => row.priceDifferenceCents).sort()).toEqual([0, null]);
  });

  it("answers a product without brand or net content with nulls", async () => {
    const context = await setUp();
    const { productId } = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    await insertReceivedOrder(db, {
      ...context,
      productId,
      receivedAt: new Date("2026-10-12T15:00:00.000Z"),
    });

    const rows = await new DrizzleReceiptDifferencesReader(db).receiptLines({
      locationId: context.locationId,
      range: october,
    });

    expect(rows[0]?.product).toEqual({
      id: productId,
      name: "Harina",
      brandName: null,
      netContent: null,
      saleUnit: "KG",
    });
  });

  it("includes the receipts of the first and of the last Argentina day of the range", async () => {
    const context = await setUp();
    const first = await insertReceivedOrder(db, {
      ...context,
      receivedAt: new Date("2026-10-01T03:10:00.000Z"),
    });
    const last = await insertReceivedOrder(db, {
      ...context,
      receivedAt: new Date("2026-11-01T02:30:00.000Z"),
    });

    const rows = await new DrizzleReceiptDifferencesReader(db).receiptLines({
      locationId: context.locationId,
      range: october,
    });

    expect(rows.map((row) => row.receiptId).sort()).toEqual(
      [first.receiptId, last.receiptId].sort(),
    );
  });

  it("leaves out the receipts of the Argentina days around the range", async () => {
    const context = await setUp();
    await insertReceivedOrder(db, {
      ...context,
      receivedAt: new Date("2026-10-01T02:50:00.000Z"),
    });
    await insertReceivedOrder(db, {
      ...context,
      receivedAt: new Date("2026-11-01T03:10:00.000Z"),
    });

    const rows = await new DrizzleReceiptDifferencesReader(db).receiptLines({
      locationId: context.locationId,
      range: october,
    });

    expect(rows).toEqual([]);
  });

  it("leaves out the receipts of the orders of another branch", async () => {
    const context = await setUp();
    await insertReceivedOrder(db, {
      ...context,
      locationId: await insertLocation(db),
      receivedAt: new Date("2026-10-12T15:00:00.000Z"),
    });

    const rows = await new DrizzleReceiptDifferencesReader(db).receiptLines({
      locationId: context.locationId,
      range: october,
    });

    expect(rows).toEqual([]);
  });
});
