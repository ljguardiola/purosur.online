import {
  buildPurchaseOrders,
  cancelPurchaseOrder,
  editPurchaseOrder,
} from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { purchaseOrderLines, purchaseOrders } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchaseOrderStore } from "./drizzle-purchase-order-store.js";
import {
  insertAnotherLocation,
  insertOfferedItem,
  insertOfferedProduct,
} from "./test-support/purchase-order-fixtures.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertSupplier,
  insertSupplierItemPrice,
} from "./test-support/supplier-price-list-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;

const CREATED_AT = new Date("2026-09-16T15:00:00.000Z");
const CANCELLED_AT = new Date("2026-09-17T15:00:00.000Z");

const store = () => new DrizzlePurchaseOrderStore(db);

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

function build(choices: { productId: string; supplierId: string; packages: number }[]) {
  return buildPurchaseOrders(
    { store: store(), clock: { now: () => CREATED_AT } },
    { locationId, actorId, choices },
  );
}

describe("the draft purchase orders a purchase order store keeps", () => {
  it("stores one draft per supplier with its lines in the order chosen, priced from the supplier's list", async () => {
    const first = await insertOfferedProduct(db, {
      actorId,
      name: "Yerba",
      quantity: 6_000,
      priceCents: 12_000,
    });
    const second = await insertOfferedProduct(db, {
      actorId,
      name: "Azúcar",
      quantity: 10_000,
      priceCents: 8_000,
      saleUnit: "KG",
    });
    const third = await insertOfferedProduct(db, {
      actorId,
      name: "Fideos",
      supplierId: first.supplierId,
      quantity: 12_000,
      priceCents: 5_000,
    });

    const outcome = await build([
      { ...first, packages: 2 },
      { ...second, packages: 3 },
      { ...third, packages: 1 },
    ]);

    if (outcome.kind !== "created") {
      throw new Error(`test setup: building ended as ${outcome.kind}`);
    }
    const orders = await db.select().from(purchaseOrders);
    expect(orders.map((order) => order.id).sort()).toEqual([...outcome.orderIds].sort());
    expect(orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          supplierId: first.supplierId,
          locationId,
          state: "DRAFT",
          createdAt: CREATED_AT,
          actorId,
          cancelledAt: null,
          cancelledBy: null,
        }),
      ]),
    );
    const order = orders.find((candidate) => candidate.supplierId === first.supplierId);
    const lines = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, order?.id as string));
    expect(
      lines
        .sort((a, b) => a.position - b.position)
        .map(
          ({ position, productId, packages, quantityPerPackage, expectedPackagePriceCents }) => ({
            position,
            productId,
            packages,
            quantityPerPackage,
            expectedPackagePriceCents,
          }),
        ),
    ).toEqual([
      {
        position: 1,
        productId: first.productId,
        packages: 2,
        quantityPerPackage: 6_000,
        expectedPackagePriceCents: 12_000,
      },
      {
        position: 2,
        productId: third.productId,
        packages: 1,
        quantityPerPackage: 12_000,
        expectedPackagePriceCents: 5_000,
      },
    ]);
  });

  it("replaces the lines of a draft and keeps the price of a line that stays", async () => {
    const yerba = await insertOfferedProduct(db, {
      actorId,
      name: "Yerba",
      quantity: 6_000,
      priceCents: 12_000,
    });
    const created = await build([{ ...yerba, packages: 2 }]);
    if (created.kind !== "created") {
      throw new Error(`test setup: building ended as ${created.kind}`);
    }
    const [orderId] = created.orderIds as [string];
    const added = await insertProduct(db, { name: "Mate" });
    await insertOfferedItem(db, {
      supplierId: yerba.supplierId,
      productId: added.id,
      actorId,
      quantity: 1_000,
      priceCents: 3_000,
    });
    const unpriced = await insertProduct(db, { name: "Bombilla" });

    const outcome = await editPurchaseOrder(
      { store: store() },
      {
        locationId,
        orderId,
        lines: [
          { productId: added.id, packages: 4, quantityPerPackage: 1_000 },
          { productId: yerba.productId, packages: 5, quantityPerPackage: 6_000 },
          { productId: unpriced.id, packages: 1, quantityPerPackage: 1_000 },
        ],
      },
    );

    expect(outcome).toEqual({ kind: "edited" });
    const lines = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, orderId));
    expect(
      lines
        .sort((a, b) => a.position - b.position)
        .map(({ position, productId, packages, expectedPackagePriceCents }) => [
          position,
          productId,
          packages,
          expectedPackagePriceCents,
        ]),
    ).toEqual([
      [1, added.id, 4, 3_000],
      [2, yerba.productId, 5, 12_000],
      [3, unpriced.id, 1, null],
    ]);
  });

  it("cancels a draft, recording when and by whom", async () => {
    const yerba = await insertOfferedProduct(db, {
      actorId,
      name: "Yerba",
      quantity: 6_000,
      priceCents: 12_000,
    });
    const created = await build([{ ...yerba, packages: 2 }]);
    if (created.kind !== "created") {
      throw new Error(`test setup: building ended as ${created.kind}`);
    }
    const [orderId] = created.orderIds as [string];
    const canceller = await insertActor(db);

    const outcome = await cancelPurchaseOrder(
      { store: store(), clock: { now: () => CANCELLED_AT } },
      { locationId, orderId, actorId: canceller },
    );

    expect(outcome).toEqual({ kind: "cancelled" });
    const [row] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId));
    expect(row).toMatchObject({
      state: "CANCELLED",
      cancelledAt: CANCELLED_AT,
      cancelledBy: canceller,
    });
  });

  it("does not find an order of another branch", async () => {
    const yerba = await insertOfferedProduct(db, {
      actorId,
      name: "Yerba",
      quantity: 6_000,
      priceCents: 12_000,
    });
    const created = await build([{ ...yerba, packages: 2 }]);
    if (created.kind !== "created") {
      throw new Error(`test setup: building ended as ${created.kind}`);
    }
    const otherLocationId = await insertAnotherLocation(db);

    const locked = await store().transaction((tx) =>
      tx.lockPurchaseOrder(otherLocationId, created.orderIds[0] as string),
    );

    expect(locked).toEqual({ kind: "not_found" });
  });

  it("reads the order locked with its state and lines", async () => {
    const yerba = await insertOfferedProduct(db, {
      actorId,
      name: "Yerba",
      quantity: 6_000,
      priceCents: 12_000,
    });
    const created = await build([{ ...yerba, packages: 2 }]);
    if (created.kind !== "created") {
      throw new Error(`test setup: building ended as ${created.kind}`);
    }

    const locked = await store().transaction((tx) =>
      tx.lockPurchaseOrder(locationId, created.orderIds[0] as string),
    );

    expect(locked).toEqual({
      kind: "locked",
      order: {
        id: created.orderIds[0],
        supplierId: yerba.supplierId,
        state: "DRAFT",
        lines: [
          {
            productId: yerba.productId,
            packages: 2,
            quantityPerPackage: 6_000,
            expectedPackagePriceCents: 12_000,
          },
        ],
      },
    });
  });
});

describe("the offers of a supplier for a product", () => {
  it("are none when the supplier has no item linked to the product", async () => {
    const supplierId = await insertSupplier(db, { actorId });
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const other = await insertSupplier(db, { actorId });
    await insertOfferedItem(db, {
      supplierId: other,
      productId,
      actorId,
      quantity: 1_000,
      priceCents: 900,
    });

    const offers = await store().transaction((tx) => tx.supplierOffers(supplierId, productId));

    expect(offers).toEqual([]);
  });

  it("take the price of the supplier's latest list, a tie going to the list confirmed later", async () => {
    const supplierId = await insertSupplier(db, { actorId });
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const itemId = await insertOfferedItem(db, {
      supplierId,
      productId,
      actorId,
      quantity: 6_000,
      priceCents: 10_000,
      listDate: "2026-03-01",
    });
    const newer = (priceCents: number, confirmedAt: string, listDate = "2026-04-01") =>
      insertPriceList(db, { supplierId, locationId, actorId, state: "REVIEWED" }).then((listId) =>
        insertSupplierItemPrice(db, {
          itemId,
          listId,
          priceCents,
          listDate,
          confirmedAt: new Date(confirmedAt),
        }),
      );
    await newer(11_000, "2026-04-02T10:00:00.000Z");
    await newer(11_500, "2026-04-02T12:00:00.000Z");
    await newer(9_000, "2026-03-20T12:00:00.000Z", "2026-03-15");

    const offers = await store().transaction((tx) => tx.supplierOffers(supplierId, productId));

    expect(offers).toEqual([
      {
        link: { quantity: 6_000, saleUnit: "UNIT", relinkRequired: false },
        priceCents: 11_500,
        pricesIncludeVat: false,
        vatRate: 2_100,
      },
    ]);
  });

  it("are every item of the supplier linked to the product, smallest package first, whatever its link's state", async () => {
    const supplierId = await insertSupplier(db, { actorId });
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    await insertOfferedItem(db, {
      supplierId,
      productId,
      actorId,
      quantity: 12_000,
      priceCents: 30_000,
      vatRate: null,
    });
    await insertOfferedItem(db, {
      supplierId,
      productId,
      actorId,
      quantity: 1_000,
      priceCents: 2_000,
      relinkRequired: true,
    });

    const offers = await store().transaction((tx) => tx.supplierOffers(supplierId, productId));

    expect(offers).toEqual([
      {
        link: { quantity: 1_000, saleUnit: "UNIT", relinkRequired: true },
        priceCents: 2_000,
        pricesIncludeVat: false,
        vatRate: 2_100,
      },
      {
        link: { quantity: 12_000, saleUnit: "UNIT", relinkRequired: false },
        priceCents: 30_000,
        pricesIncludeVat: false,
        vatRate: null,
      },
    ]);
  });

  it("let an order take a current item without a comparable price over an outdated one", async () => {
    const supplierId = await insertSupplier(db, { actorId });
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    await insertOfferedItem(db, {
      supplierId,
      productId,
      actorId,
      quantity: 1_000,
      priceCents: 2_000,
      relinkRequired: true,
    });
    await insertOfferedItem(db, {
      supplierId,
      productId,
      actorId,
      quantity: 6_000,
      priceCents: 9_000,
      vatRate: null,
    });

    const outcome = await build([{ productId, supplierId, packages: 2 }]);

    expect(outcome.kind).toBe("created");
    expect(
      await db
        .select({
          quantityPerPackage: purchaseOrderLines.quantityPerPackage,
          expectedPackagePriceCents: purchaseOrderLines.expectedPackagePriceCents,
        })
        .from(purchaseOrderLines),
    ).toEqual([{ quantityPerPackage: 6_000, expectedPackagePriceCents: 9_000 }]);
  });
});
