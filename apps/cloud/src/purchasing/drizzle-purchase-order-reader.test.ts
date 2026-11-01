import { buildPurchaseOrders, cancelPurchaseOrder } from "@purosur/domain/purchasing/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchaseOrderReader } from "./drizzle-purchase-order-reader.js";
import { DrizzlePurchaseOrderStore } from "./drizzle-purchase-order-store.js";
import {
  insertAnotherLocation,
  insertOfferedItem,
} from "./test-support/purchase-order-fixtures.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import { insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

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
      brandName: "Taragüí",
      netContent: { quantity: 1_000, unit: "g" },
    });
    const { id: azucarId } = await insertProduct(db, { name: "Azúcar", saleUnit: "KG" });
    const supplierId = await insertSupplier(db, { actorId, name: "Alfa" });
    await insertOfferedItem(db, {
      supplierId,
      productId: yerbaId,
      actorId,
      quantity: 6_000,
      priceCents: 7_000,
    });
    await insertOfferedItem(db, {
      supplierId,
      productId: azucarId,
      actorId,
      quantity: 10_000,
      priceCents: 4_000,
      saleUnit: "KG",
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
        },
        {
          product: {
            id: yerbaId,
            name: "Yerba",
            brandName: "Taragüí",
            netContent: { quantity: 1_000, unit: "g" },
            saleUnit: "UNIT",
          },
          packages: 1,
          quantityPerPackage: 6_000,
          expectedPackagePriceCents: 7_000,
        },
      ],
    });
  });
});
