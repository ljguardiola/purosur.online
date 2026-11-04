import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  purchaseLines,
  purchaseOrderReceiptLines,
  purchaseOrderReceipts,
  purchaseOrders,
  purchases,
  stockBalances,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { insertAnotherLocation } from "./test-support/purchase-order-fixtures.js";
import {
  insertSentOrder,
  RECEIVED_AT,
  receiveOrder,
} from "./test-support/purchase-order-receipt-fixtures.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;

const SECOND_DELIVERY_AT = new Date("2026-03-12T12:00:00.000Z");

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  actorId = await insertActor(db);
  locationId = await seededLocationId(db);
});

function yerbaOrder() {
  return insertSentOrder(db, {
    actorId,
    locationId,
    products: [
      { name: "Yerba", packages: 3, quantityPerPackage: 12_000, packagePriceCents: 3_000 },
    ],
  });
}

function packagesOf(productId: string, packages: number, costPaidCents = 3_000) {
  return {
    loadedBy: "packages" as const,
    productId,
    packages,
    quantityPerPackage: 12_000,
    costPaidCents,
    expiresOn: null,
  };
}

describe("receiving a purchase order into a purchase", () => {
  it("keeps the receipt of a delivery in part with its purchase and the differences of each line", async () => {
    const { orderId, productIds } = await yerbaOrder();
    const [productId] = productIds as [string];

    const outcome = await receiveOrder(db, {
      locationId,
      orderId,
      actorId,
      lines: [packagesOf(productId, 2, 3_300)],
    });

    if (outcome.kind !== "received") {
      throw new Error(`expected the order to be received, got ${outcome.kind}`);
    }
    expect(outcome.state).toBe("PARTIALLY_RECEIVED");
    const receipts = await db.select().from(purchaseOrderReceipts);
    expect(receipts).toEqual([
      {
        id: expect.any(String),
        purchaseOrderId: orderId,
        purchaseId: outcome.purchaseId,
        actorId,
        receivedAt: RECEIVED_AT,
      },
    ]);
    const lines = await db.select().from(purchaseOrderReceiptLines);
    expect(lines).toEqual([
      {
        purchaseOrderReceiptId: receipts[0]?.id,
        purchaseOrderLineId: expect.any(String),
        receivedQuantity: 24_000,
        missingQuantity: 12_000,
        priceDifferenceCents: 600,
      },
    ]);
    const [order] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId));
    expect(order).toMatchObject({ state: "PARTIALLY_RECEIVED", receivedAt: null });
    expect(await db.select().from(purchaseLines)).toHaveLength(1);
    expect((await db.select().from(stockBalances))[0]?.quantity).toBe(24_000);
  });

  it("finishes the order when a second delivery brings what the first left outstanding", async () => {
    const { orderId, productIds } = await yerbaOrder();
    const [productId] = productIds as [string];
    await receiveOrder(db, { locationId, orderId, actorId, lines: [packagesOf(productId, 2)] });

    const second = await receiveOrder(db, {
      locationId,
      orderId,
      actorId,
      at: SECOND_DELIVERY_AT,
      lines: [packagesOf(productId, 1)],
    });

    expect(second).toMatchObject({ kind: "received", state: "RECEIVED" });
    const [order] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId));
    expect(order).toMatchObject({ state: "RECEIVED", receivedAt: SECOND_DELIVERY_AT });
    const lines = await db
      .select({
        receivedQuantity: purchaseOrderReceiptLines.receivedQuantity,
        missingQuantity: purchaseOrderReceiptLines.missingQuantity,
      })
      .from(purchaseOrderReceiptLines)
      .innerJoin(
        purchaseOrderReceipts,
        eq(purchaseOrderReceipts.id, purchaseOrderReceiptLines.purchaseOrderReceiptId),
      )
      .orderBy(asc(purchaseOrderReceipts.receivedAt));
    expect(lines).toEqual([
      { receivedQuantity: 24_000, missingQuantity: 12_000 },
      { receivedQuantity: 12_000, missingQuantity: 0 },
    ]);
    expect(await db.select().from(purchases)).toHaveLength(2);
  });

  it("does not find an order of another branch and records nothing", async () => {
    const { orderId, productIds } = await yerbaOrder();
    const otherLocationId = await insertAnotherLocation(db);

    const outcome = await receiveOrder(db, {
      locationId: otherLocationId,
      orderId,
      actorId,
      lines: [packagesOf(productIds[0] as string, 3)],
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(await db.select().from(purchaseOrderReceipts)).toEqual([]);
    expect(await db.select().from(purchases)).toEqual([]);
  });

  it("leaves no receipt, purchase or stock behind when the delivery is refused halfway", async () => {
    const { orderId, productIds } = await yerbaOrder();
    const [productId] = productIds as [string];

    const outcome = await receiveOrder(db, {
      locationId,
      orderId,
      actorId,
      lines: [packagesOf(productId, 1), { ...packagesOf(productId, 1), quantityPerPackage: 1_500 }],
    });

    expect(outcome.kind).toBe("invalid_quantity");
    expect(await db.select().from(purchaseOrderReceipts)).toEqual([]);
    expect(await db.select().from(purchases)).toEqual([]);
    expect(await db.select().from(stockBalances)).toEqual([]);
    const [order] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId));
    expect(order?.state).toBe("SENT");
  });
});
