import { buildPurchaseOrders, cancelPurchaseOrder } from "@purosur/domain/purchasing/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { supplierItems } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchaseOrderReader } from "./drizzle-purchase-order-reader.js";
import { DrizzlePurchaseOrderStore } from "./drizzle-purchase-order-store.js";
import {
  insertAnotherLocation,
  insertOfferedItem,
} from "./test-support/purchase-order-fixtures.js";
import {
  insertSentOrder,
  RECEIVED_AT,
  receiveOrder,
} from "./test-support/purchase-order-receipt-fixtures.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import { insertSupplier, insertSupplierItem } from "./test-support/supplier-price-list-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;

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

const reader = () => new DrizzlePurchaseOrderReader(db);

async function draftFor(
  at: string,
  where: { locationId: string; supplierId: string; productId: string; packages?: number },
): Promise<string> {
  const outcome = await buildPurchaseOrders(
    { store: new DrizzlePurchaseOrderStore(db), clock: { now: () => new Date(at) } },
    {
      locationId: where.locationId,
      actorId,
      choices: [
        { productId: where.productId, supplierId: where.supplierId, packages: where.packages ?? 1 },
      ],
    },
  );
  if (outcome.kind !== "created") {
    throw new Error(`test setup: building ended as ${outcome.kind}`);
  }
  return outcome.orderIds[0] as string;
}

async function offeredBySupplier(name: string, productId: string) {
  const supplierId = await insertSupplier(db, { actorId, name });
  await insertOfferedItem(db, {
    supplierId,
    productId,
    actorId,
    quantity: 6_000,
    priceCents: 7_000,
  });
  return supplierId;
}

describe("the purchase orders of a branch", () => {
  it("lists them most recently created first, with their supplier, state and priced lines", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const alfa = await offeredBySupplier("Alfa", productId);
    const beta = await offeredBySupplier("Beta", productId);
    const older = await draftFor("2026-09-01T10:00:00.000Z", {
      locationId,
      supplierId: alfa,
      productId,
      packages: 3,
    });
    const newer = await draftFor("2026-09-02T10:00:00.000Z", {
      locationId,
      supplierId: beta,
      productId,
    });

    const orders = await reader().orders(locationId);

    expect(orders).toEqual([
      {
        id: newer,
        supplier: { id: beta, name: "Beta" },
        state: "DRAFT",
        createdAt: new Date("2026-09-02T10:00:00.000Z"),
        lines: [{ packages: 1, expectedPackagePriceCents: 7_000 }],
      },
      {
        id: older,
        supplier: { id: alfa, name: "Alfa" },
        state: "DRAFT",
        createdAt: new Date("2026-09-01T10:00:00.000Z"),
        lines: [{ packages: 3, expectedPackagePriceCents: 7_000 }],
      },
    ]);
  });

  it("lists only the orders in the state asked for", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const supplierId = await offeredBySupplier("Alfa", productId);
    const kept = await draftFor("2026-09-01T10:00:00.000Z", { locationId, supplierId, productId });
    const cancelled = await draftFor("2026-09-02T10:00:00.000Z", {
      locationId,
      supplierId,
      productId,
    });
    await cancelPurchaseOrder(
      { store: new DrizzlePurchaseOrderStore(db), clock: { now: () => new Date() } },
      { locationId, orderId: cancelled, actorId },
    );

    const drafts = await reader().orders(locationId, "DRAFT");
    const cancelledOnes = await reader().orders(locationId, "CANCELLED");

    expect(drafts.map((order) => order.id)).toEqual([kept]);
    expect(cancelledOnes.map((order) => order.id)).toEqual([cancelled]);
  });

  it("leaves out the orders of another branch", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const supplierId = await offeredBySupplier("Alfa", productId);
    const otherLocationId = await insertAnotherLocation(db);
    const own = await draftFor("2026-09-01T10:00:00.000Z", { locationId, supplierId, productId });
    const foreign = await draftFor("2026-09-02T10:00:00.000Z", {
      locationId: otherLocationId,
      supplierId,
      productId,
    });

    expect((await reader().orders(locationId)).map((order) => order.id)).toEqual([own]);
    expect(await reader().order(locationId, foreign)).toBeUndefined();
  });

  it("answers an order with each line's product, brand and net content in the order of its positions", async () => {
    const { id: yerbaId } = await insertProduct(db, {
      name: "Yerba",
      brandName: "Piragüé",
      netContent: { quantity: 1_000, unit: "G" },
    });
    const { id: azucarId } = await insertProduct(db, { name: "Azúcar", saleUnit: "KG" });
    const supplierId = await insertSupplier(db, { actorId, name: "Alfa" });
    await insertOfferedItem(db, {
      supplierId,
      productId: yerbaId,
      actorId,
      quantity: 6_000,
      priceCents: 7_000,
      keyValue: "YER-6",
      description: "Yerba Piragüé 1 kg x6",
    });
    await insertOfferedItem(db, {
      supplierId,
      productId: azucarId,
      actorId,
      quantity: 10_000,
      priceCents: 4_000,
      saleUnit: "KG",
      keyKind: "description",
      keyValue: "Azúcar bolsa 10 kg",
      description: "Azúcar bolsa 10 kg",
    });
    const outcome = await buildPurchaseOrders(
      {
        store: new DrizzlePurchaseOrderStore(db),
        clock: { now: () => new Date("2026-09-01T10:00:00.000Z") },
      },
      {
        locationId,
        actorId,
        choices: [
          { productId: azucarId, supplierId, packages: 2 },
          { productId: yerbaId, supplierId, packages: 1 },
        ],
      },
    );
    if (outcome.kind !== "created") {
      throw new Error(`test setup: building ended as ${outcome.kind}`);
    }

    const order = await reader().order(locationId, outcome.orderIds[0] as string);

    expect(order).toEqual({
      id: outcome.orderIds[0],
      supplier: { id: supplierId, name: "Alfa" },
      state: "DRAFT",
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
      lines: [
        {
          product: {
            id: azucarId,
            name: "Azúcar",
            brandName: null,
            netContent: null,
            saleUnit: "KG",
          },
          packages: 2,
          quantityPerPackage: 10_000,
          expectedPackagePriceCents: 4_000,
          supplierItem: { code: null, description: "Azúcar bolsa 10 kg" },
          receivedQuantity: 0,
        },
        {
          product: {
            id: yerbaId,
            name: "Yerba",
            brandName: "Piragüé",
            netContent: { quantity: 1_000, unit: "G" },
            saleUnit: "UNIT",
          },
          packages: 1,
          quantityPerPackage: 6_000,
          expectedPackagePriceCents: 7_000,
          supplierItem: { code: "YER-6", description: "Yerba Piragüé 1 kg x6" },
          receivedQuantity: 0,
        },
      ],
      receipts: [],
    });
  });
});

describe("the supplier item a purchase order line answers", () => {
  async function supplierItemOfDraft(supplierId: string, productId: string) {
    const orderId = await draftFor("2026-09-01T10:00:00.000Z", {
      locationId,
      supplierId,
      productId,
    });
    const order = await reader().order(locationId, orderId);
    return order?.lines[0]?.supplierItem;
  }

  function offer(
    supplierId: string,
    productId: string,
    item: { quantity: number; keyValue: string; description: string } & Partial<
      Parameters<typeof insertOfferedItem>[1]
    >,
  ) {
    return insertOfferedItem(db, { supplierId, productId, actorId, priceCents: 7_000, ...item });
  }

  it("is the item of the order's supplier linked to the product at the line's quantity", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const alfa = await insertSupplier(db, { actorId, name: "Alfa" });
    const beta = await insertSupplier(db, { actorId, name: "Beta" });
    await offer(alfa, productId, { quantity: 6_000, keyValue: "ALFA-6", description: "Yerba x6" });
    await insertSupplierItem(db, {
      supplierId: alfa,
      keyValue: "ALFA-12",
      description: "Yerba x12",
      productId,
      quantity: 12_000,
      saleUnit: "UNIT",
    });
    await offer(beta, productId, { quantity: 6_000, keyValue: "BETA-6", description: "Yerba B" });

    expect(await supplierItemOfDraft(alfa, productId)).toEqual({
      code: "ALFA-6",
      description: "Yerba x6",
    });
  });

  it("is none when the link asks to be reviewed again", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const supplierId = await insertSupplier(db, { actorId, name: "Alfa" });
    await offer(supplierId, productId, { quantity: 6_000, keyValue: "A-1", description: "Yerba" });
    const orderId = await draftFor("2026-09-01T10:00:00.000Z", {
      locationId,
      supplierId,
      productId,
    });
    await db.update(supplierItems).set({ relinkRequired: true });

    const order = await reader().order(locationId, orderId);

    expect(order?.lines[0]?.supplierItem).toBeNull();
  });

  it("is none when the link is stated in another sale unit than the product's", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const supplierId = await insertSupplier(db, { actorId, name: "Alfa" });
    await offer(supplierId, productId, { quantity: 6_000, keyValue: "A-1", description: "Yerba" });
    const orderId = await draftFor("2026-09-01T10:00:00.000Z", {
      locationId,
      supplierId,
      productId,
    });
    await db.update(supplierItems).set({ saleUnit: "KG" });

    const order = await reader().order(locationId, orderId);

    expect(order?.lines[0]?.supplierItem).toBeNull();
  });

  it("is the one cheapest per sale unit when several items match", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const supplierId = await insertSupplier(db, { actorId, name: "Alfa" });
    await offer(supplierId, productId, {
      quantity: 6_000,
      keyKind: "code",
      keyValue: "A-1",
      description: "Yerba A",
      priceCents: 9_000,
    });
    await offer(supplierId, productId, {
      quantity: 6_000,
      keyKind: "code",
      keyValue: "Z-9",
      description: "Yerba Z",
      priceCents: 6_000,
    });
    await offer(supplierId, productId, {
      quantity: 6_000,
      keyKind: "description",
      keyValue: "B yerba",
      description: "B yerba",
      priceCents: 8_000,
    });

    expect(await supplierItemOfDraft(supplierId, productId)).toEqual({
      code: "Z-9",
      description: "Yerba Z",
    });
  });

  it("is none when the supplier has no item for the product any more", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const supplierId = await offeredBySupplier("Alfa", productId);
    const orderId = await draftFor("2026-09-01T10:00:00.000Z", {
      locationId,
      supplierId,
      productId,
    });
    await db.update(supplierItems).set({ productId: null, quantity: null, saleUnit: null });

    const order = await reader().order(locationId, orderId);

    expect(order?.lines[0]?.supplierItem).toBeNull();
  });
});

describe("what a purchase order has received", () => {
  const SECOND_DELIVERY_AT = new Date("2026-03-12T12:00:00.000Z");

  async function orderOfTwo() {
    const sent = await insertSentOrder(db, {
      actorId,
      locationId,
      products: [
        { name: "Yerba", packages: 3, quantityPerPackage: 12_000, packagePriceCents: 3_000 },
        { name: "Azúcar", packages: 2, quantityPerPackage: 10_000, packagePriceCents: 4_000 },
      ],
    });
    const [yerbaId, azucarId] = sent.productIds as [string, string];
    return { ...sent, yerbaId, azucarId };
  }

  function packages(productId: string, count: number, quantityPerPackage: number, cost: number) {
    return {
      loadedBy: "packages" as const,
      productId,
      packages: count,
      quantityPerPackage,
      costPaidCents: cost,
      expiresOn: null,
    };
  }

  it("answers each line's received quantity summed over the receipts and the receipts oldest first", async () => {
    const { orderId, yerbaId, azucarId } = await orderOfTwo();
    const first = await receiveOrder(db, {
      locationId,
      orderId,
      actorId,
      lines: [packages(yerbaId, 1, 12_000, 3_100)],
    });
    const second = await receiveOrder(db, {
      locationId,
      orderId,
      actorId,
      at: SECOND_DELIVERY_AT,
      lines: [packages(yerbaId, 1, 12_000, 3_000), packages(azucarId, 2, 10_000, 4_000)],
    });
    if (first.kind !== "received" || second.kind !== "received") {
      throw new Error("test setup: the deliveries were not received");
    }

    const order = await reader().order(locationId, orderId);

    expect(order?.state).toBe("PARTIALLY_RECEIVED");
    expect(order?.lines.map((line) => [line.product.name, line.receivedQuantity])).toEqual([
      ["Yerba", 24_000],
      ["Azúcar", 20_000],
    ]);
    expect(order?.receipts).toEqual([
      {
        id: expect.any(String),
        receivedAt: RECEIVED_AT,
        purchaseId: first.purchaseId,
        lines: [
          {
            productId: yerbaId,
            receivedQuantity: 12_000,
            missingQuantity: 24_000,
            priceDifferenceCents: 100,
          },
          {
            productId: azucarId,
            receivedQuantity: 0,
            missingQuantity: 20_000,
            priceDifferenceCents: null,
          },
        ],
      },
      {
        id: expect.any(String),
        receivedAt: SECOND_DELIVERY_AT,
        purchaseId: second.purchaseId,
        lines: [
          {
            productId: yerbaId,
            receivedQuantity: 12_000,
            missingQuantity: 12_000,
            priceDifferenceCents: 0,
          },
          {
            productId: azucarId,
            receivedQuantity: 20_000,
            missingQuantity: 0,
            priceDifferenceCents: 0,
          },
        ],
      },
    ]);
  });

  it("answers the order for receiving with its supplier, lines, what they received and the supplier's offer", async () => {
    const { orderId, supplierId, yerbaId, azucarId } = await orderOfTwo();
    await receiveOrder(db, {
      locationId,
      orderId,
      actorId,
      lines: [packages(yerbaId, 1, 12_000, 3_000)],
    });

    const order = await reader().receivableOrder(locationId, orderId);

    expect(order).toEqual({
      id: orderId,
      supplier: { id: supplierId, name: expect.any(String) },
      state: "PARTIALLY_RECEIVED",
      lines: [
        {
          product: expect.objectContaining({ id: yerbaId, name: "Yerba", saleUnit: "UNIT" }),
          packages: 3,
          quantityPerPackage: 12_000,
          receivedQuantity: 12_000,
          supplierOffer: {
            link: { quantity: 12_000, saleUnit: "UNIT", relinkRequired: false },
            priceCents: 3_000,
            pricesIncludeVat: false,
            vatRate: 2_100,
          },
        },
        {
          product: expect.objectContaining({ id: azucarId, name: "Azúcar", saleUnit: "UNIT" }),
          packages: 2,
          quantityPerPackage: 10_000,
          receivedQuantity: 0,
          supplierOffer: expect.objectContaining({ priceCents: 4_000 }),
        },
      ],
    });
  });

  it("answers no offer for a line whose supplier item was unlinked since", async () => {
    const { orderId } = await orderOfTwo();
    await db.update(supplierItems).set({ productId: null, quantity: null, saleUnit: null });

    const order = await reader().receivableOrder(locationId, orderId);

    expect(order?.lines.map((line) => line.supplierOffer)).toEqual([null, null]);
  });

  it("does not find, for receiving, an order of another branch or one that does not exist", async () => {
    const { orderId } = await orderOfTwo();
    const otherLocationId = await insertAnotherLocation(db);

    expect(await reader().receivableOrder(otherLocationId, orderId)).toBeUndefined();
    expect(await reader().receivableOrder(locationId, crypto.randomUUID())).toBeUndefined();
  });
});
