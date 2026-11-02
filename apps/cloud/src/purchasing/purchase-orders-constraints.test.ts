import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { purchaseOrderLines, purchaseOrders } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { constraintViolatedBy } from "../test-support/constraint-violated-by.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import { insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;

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
});

async function insertOrder(fields: {
  state?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  sentAt?: Date;
  sentBy?: string;
}) {
  const [order] = await db
    .insert(purchaseOrders)
    .values({
      supplierId: await insertSupplier(db, { actorId }),
      locationId: await seededLocationId(db),
      state: fields.state ?? "DRAFT",
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
      actorId,
      cancelledAt: fields.cancelledAt,
      cancelledBy: fields.cancelledBy,
      sentAt: fields.sentAt,
      sentBy: fields.sentBy,
    })
    .returning({ id: purchaseOrders.id });
  return order?.id as string;
}

async function violation(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("the constraints of purchase orders", () => {
  it("refuses a state outside the order's states", async () => {
    const error = await violation(insertOrder({ state: "LOST" }));

    expect(constraintViolatedBy(error, "purchase_orders_state_check")).toBe(true);
  });

  it("refuses a cancelled order without who and when, and a draft with them", async () => {
    const cancelledWithout = await violation(insertOrder({ state: "CANCELLED" }));
    const draftWith = await violation(
      insertOrder({ cancelledAt: new Date(), cancelledBy: actorId }),
    );

    expect(constraintViolatedBy(cancelledWithout, "purchase_orders_cancellation_check")).toBe(true);
    expect(constraintViolatedBy(draftWith, "purchase_orders_cancellation_check")).toBe(true);
  });

  it.each(["DRAFT", "SENT", "CANCELLED"])("accepts the state %s", async (state) => {
    const cancellation =
      state === "CANCELLED" ? { cancelledAt: new Date(), cancelledBy: actorId } : {};
    const sending = state === "SENT" ? { sentAt: new Date(), sentBy: actorId } : {};

    await expect(insertOrder({ state, ...cancellation, ...sending })).resolves.toEqual(
      expect.any(String),
    );
  });

  it("accepts a cancelled order that was sent before and one that never was", async () => {
    const cancellation = { state: "CANCELLED", cancelledAt: new Date(), cancelledBy: actorId };

    await expect(
      insertOrder({ ...cancellation, sentAt: new Date(), sentBy: actorId }),
    ).resolves.toEqual(expect.any(String));
    await expect(insertOrder(cancellation)).resolves.toEqual(expect.any(String));
  });

  it("refuses a sent order without who and when, and a draft with them", async () => {
    const sentWithout = await violation(insertOrder({ state: "SENT" }));
    const draftWith = await violation(insertOrder({ sentAt: new Date(), sentBy: actorId }));

    expect(constraintViolatedBy(sentWithout, "purchase_orders_sending_check")).toBe(true);
    expect(constraintViolatedBy(draftWith, "purchase_orders_sending_check")).toBe(true);
  });

  it("refuses a sending time without who sent it and the other way round", async () => {
    const withoutWho = await violation(insertOrder({ sentAt: new Date() }));
    const withoutWhen = await violation(insertOrder({ sentBy: actorId }));

    expect(constraintViolatedBy(withoutWho, "purchase_orders_sending_check")).toBe(true);
    expect(constraintViolatedBy(withoutWhen, "purchase_orders_sending_check")).toBe(true);
  });

  it("refuses a line with no packages or no quantity per package", async () => {
    const orderId = await insertOrder({});
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const line = (fields: { packages: number; quantityPerPackage: number; productId?: string }) =>
      db.insert(purchaseOrderLines).values({
        purchaseOrderId: orderId,
        position: 1,
        productId,
        expectedPackagePriceCents: null,
        ...fields,
      });

    const noPackages = await violation(line({ packages: 0, quantityPerPackage: 1_000 }));
    const noQuantity = await violation(line({ packages: 1, quantityPerPackage: 0 }));

    expect(constraintViolatedBy(noPackages, "purchase_order_lines_packages_check")).toBe(true);
    expect(
      constraintViolatedBy(noQuantity, "purchase_order_lines_quantity_per_package_check"),
    ).toBe(true);
  });

  it("refuses a product twice in an order and a position twice in an order", async () => {
    const orderId = await insertOrder({});
    const { id: productId } = await insertProduct(db, { name: "Yerba" });
    const { id: otherProductId } = await insertProduct(db, { name: "Mate" });
    const values = { purchaseOrderId: orderId, packages: 1, quantityPerPackage: 1_000 };
    await db.insert(purchaseOrderLines).values({ ...values, productId, position: 1 });

    const sameProduct = await violation(
      db.insert(purchaseOrderLines).values({ ...values, productId, position: 2 }),
    );
    const samePosition = await violation(
      db.insert(purchaseOrderLines).values({ ...values, productId: otherProductId, position: 1 }),
    );

    expect(constraintViolatedBy(sameProduct, "purchase_order_lines_order_product_key")).toBe(true);
    expect(constraintViolatedBy(samePosition, "purchase_order_lines_order_position_key")).toBe(
      true,
    );
  });
});
