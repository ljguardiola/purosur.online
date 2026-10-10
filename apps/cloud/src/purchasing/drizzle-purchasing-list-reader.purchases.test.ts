import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  locations,
  productPackagings,
  purchaseLines,
  purchases,
  suppliers,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchasingListReader } from "./drizzle-purchasing-list-reader.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;
let supplierId: string;

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
  const [supplier] = await db
    .insert(suppliers)
    .values({ name: "Distribuidora Sur", actorId })
    .returning({ id: suppliers.id });
  supplierId = supplier?.id as string;
});

async function storedPurchase(fields: Partial<typeof purchases.$inferInsert> = {}) {
  const [purchase] = await db
    .insert(purchases)
    .values({
      supplierId,
      locationId,
      purchasedOn: "2026-10-01",
      receiptType: "sin_comprobante",
      recordedAt: new Date("2026-10-02T12:00:00.000Z"),
      actorId,
      ...fields,
    })
    .returning({ id: purchases.id });
  return purchase?.id as string;
}

describe("DrizzlePurchasingListReader purchases", () => {
  it("lists a purchase with the supplier's, products' and packagings' names, one entry per line", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    const [packaging] = await db
      .insert(productPackagings)
      .values({
        productId: yerba.id,
        name: "Caja x 12",
        quantityPerPackage: 12_000,
        saleUnit: "UNIT",
        actorId,
      })
      .returning({ id: productPackagings.id });
    const purchaseId = await storedPurchase({
      receiptType: "factura_b",
      receiptNumber: "0001-00000042",
      note: "Entrega de la mañana",
    });
    await db.insert(purchaseLines).values([
      {
        purchaseId,
        productId: yerba.id,
        packagingId: packaging?.id as string,
        packages: 2,
        quantity: 24_000,
        costPaidCents: 24_000,
        quantityPerPackage: 12_000,
        lotNumber: "L-77",
        expiresOn: "2027-03-01",
      },
      {
        purchaseId,
        productId: harina.id,
        quantity: 2_500,
        costPaidCents: 1_000,
        quantityPerPackage: 1_000,
      },
    ]);

    const listed = await new DrizzlePurchasingListReader(db).purchases(locationId);

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: purchaseId,
      purchasedOn: "2026-10-01",
      supplier: { id: supplierId, name: "Distribuidora Sur" },
      receiptType: "factura_b",
      receiptNumber: "0001-00000042",
      note: "Entrega de la mañana",
      recordedAt: new Date("2026-10-02T12:00:00.000Z"),
    });
    expect(listed[0]?.lines).toHaveLength(2);
    expect(listed[0]?.lines).toContainEqual({
      id: expect.any(String),
      product: { id: yerba.id, name: "Yerba", saleUnit: "UNIT" },
      packaging: { id: packaging?.id, name: "Caja x 12" },
      packages: 2,
      quantity: 24_000,
      costPaidCents: 24_000,
      quantityPerPackage: 12_000,
      lotNumber: "L-77",
      expiresOn: "2027-03-01",
    });
    expect(listed[0]?.lines).toContainEqual({
      id: expect.any(String),
      product: { id: harina.id, name: "Harina", saleUnit: "KG" },
      packaging: null,
      packages: null,
      quantity: 2_500,
      costPaidCents: 1_000,
      quantityPerPackage: 1_000,
      lotNumber: null,
      expiresOn: null,
    });
  });

  it("lists the most recently recorded purchase first, breaking a tie by id", async () => {
    const recordedAt = new Date("2026-10-02T12:00:00.000Z");
    const older = await storedPurchase({ recordedAt: new Date("2026-10-01T09:00:00.000Z") });
    const newer = await storedPurchase({ recordedAt: new Date("2026-10-03T09:00:00.000Z") });
    const tiedA = await storedPurchase({ recordedAt });
    const tiedB = await storedPurchase({ recordedAt });
    const [firstTied, secondTied] = [tiedA, tiedB].sort().reverse();

    const listed = await new DrizzlePurchasingListReader(db).purchases(locationId);

    expect(listed.map((purchase) => purchase.id)).toEqual([newer, firstTied, secondTied, older]);
  });

  it("lists only the purchases of the branch asked for", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    await storedPurchase({ locationId: otherLocation?.id as string });
    const own = await storedPurchase();

    const listed = await new DrizzlePurchasingListReader(db).purchases(locationId);

    expect(listed.map((purchase) => purchase.id)).toEqual([own]);
  });

  it("finds a purchase by its id, and answers nothing for one that does not exist", async () => {
    const purchaseId = await storedPurchase();

    const reader = new DrizzlePurchasingListReader(db);

    expect((await reader.purchase(purchaseId))?.id).toBe(purchaseId);
    expect(await reader.purchase("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });

  it("lists a purchase with no lines as having none", async () => {
    await storedPurchase();

    const [listed] = await new DrizzlePurchasingListReader(db).purchases(locationId);

    expect(listed?.lines).toEqual([]);
  });
});
