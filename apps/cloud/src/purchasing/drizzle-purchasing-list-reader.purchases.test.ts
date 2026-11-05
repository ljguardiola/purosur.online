import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { locations, lots, purchaseLines, purchases, suppliers } from "../platform/db/schema.js";
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

async function lotOfLine(lineId: string, productId: string, purchasedOn = "2026-10-01") {
  const [lot] = await db
    .insert(lots)
    .values({
      productId,
      locationId,
      purchaseLineId: lineId,
      purchasedOn,
      costTotalCents: 500,
      costQuantity: 1_000,
      quantityReceived: 1_000,
      remaining: 1_000,
    })
    .returning({ id: lots.id });
  return lot?.id as string;
}

describe("DrizzlePurchasingListReader purchases", () => {
  it("lists a purchase with the supplier's and products' names, one entry per line", async () => {
    const yerba = await insertProduct(db, {
      name: "Yerba",
      brandName: "Piragüé",
      netContent: { quantity: 500, unit: "G" },
    });
    const harina = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    const purchaseId = await storedPurchase({
      receiptType: "factura_b",
      receiptNumber: "0001-00000042",
      note: "Entrega de la mañana",
    });
    const [yerbaLine, harinaLine] = await db
      .insert(purchaseLines)
      .values([
        {
          purchaseId,
          position: 1,
          productId: yerba.id,
          packages: 2,
          quantity: 24_000,
          costPaidCents: 24_000,
          quantityPerPackage: 12_000,
          expiresOn: "2027-03-01",
        },
        {
          purchaseId,
          position: 2,
          productId: harina.id,
          quantity: 2_500,
          costPaidCents: 1_000,
          quantityPerPackage: 1_000,
        },
      ])
      .returning({ id: purchaseLines.id });
    const yerbaLot = await lotOfLine(yerbaLine?.id as string, yerba.id);
    const harinaLot = await lotOfLine(harinaLine?.id as string, harina.id);

    const listed = await new DrizzlePurchasingListReader(db).purchases(locationId);

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: purchaseId,
      locationId,
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
      product: {
        id: yerba.id,
        name: "Yerba",
        brandName: "Piragüé",
        netContent: { quantity: 500, unit: "G" },
        saleUnit: "UNIT",
      },
      packages: 2,
      quantity: 24_000,
      costPaidCents: 24_000,
      quantityPerPackage: 12_000,
      lotId: yerbaLot,
      remainingInLot: 1_000,
      expiresOn: "2027-03-01",
    });
    expect(listed[0]?.lines).toContainEqual({
      id: expect.any(String),
      product: { id: harina.id, name: "Harina", brandName: null, netContent: null, saleUnit: "KG" },
      packages: null,
      quantity: 2_500,
      costPaidCents: 1_000,
      quantityPerPackage: 1_000,
      lotId: harinaLot,
      remainingInLot: 1_000,
      expiresOn: null,
    });
  });

  it("lists the lines of a purchase in the order they were entered, not by product name", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const arroz = await insertProduct(db, { name: "Arroz" });
    const purchaseId = await storedPurchase();
    const line = { purchaseId, quantity: 1_000, costPaidCents: 500, quantityPerPackage: 1_000 };
    const inserted = await db
      .insert(purchaseLines)
      .values([
        { ...line, position: 2, productId: arroz.id },
        { ...line, position: 1, productId: yerba.id },
      ])
      .returning({ id: purchaseLines.id, productId: purchaseLines.productId });
    for (const { id, productId } of inserted) {
      await lotOfLine(id, productId);
    }

    const [listed] = await new DrizzlePurchasingListReader(db).purchases(locationId);

    expect(listed?.lines.map((entry) => entry.product.name)).toEqual(["Yerba", "Arroz"]);
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

  it("answers the name facts of the lots of the products asked in the branch, whatever purchase created them", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const first = await storedPurchase({ purchasedOn: "2026-11-03" });
    const second = await storedPurchase({ purchasedOn: "2026-11-03" });
    const line = { quantity: 1_000, costPaidCents: 500, quantityPerPackage: 1_000, position: 1 };
    const [firstLine] = await db
      .insert(purchaseLines)
      .values({ ...line, purchaseId: first, productId: yerba.id })
      .returning({ id: purchaseLines.id });
    const [secondLine] = await db
      .insert(purchaseLines)
      .values({ ...line, purchaseId: second, productId: yerba.id })
      .returning({ id: purchaseLines.id });
    const firstLot = await lotOfLine(firstLine?.id as string, yerba.id, "2026-11-03");
    const secondLot = await lotOfLine(secondLine?.id as string, yerba.id, "2026-11-03");

    const facts = await new DrizzlePurchasingListReader(db).lotNameFacts(locationId, [yerba.id]);

    expect(facts.map(({ lotId, origin }) => ({ lotId, origin }))).toEqual(
      expect.arrayContaining([
        { lotId: firstLot, origin: { kind: "purchase", purchasedOn: "2026-11-03" } },
        { lotId: secondLot, origin: { kind: "purchase", purchasedOn: "2026-11-03" } },
      ]),
    );
    expect(facts).toHaveLength(2);
  });
});

describe("DrizzlePurchasingListReader removed lines and withdrawn lots", () => {
  async function lineOf(purchaseId: string, productId: string, position: number) {
    const [line] = await db
      .insert(purchaseLines)
      .values({
        purchaseId,
        position,
        productId,
        quantity: 1_000,
        costPaidCents: 500,
        quantityPerPackage: 1_000,
      })
      .returning({ id: purchaseLines.id });
    return line?.id as string;
  }

  it("lists a purchase without the lines that were removed", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchaseId = await storedPurchase();
    const kept = await lineOf(purchaseId, yerba.id, 1);
    const removed = await lineOf(purchaseId, yerba.id, 2);
    await lotOfLine(kept, yerba.id);
    await lotOfLine(removed, yerba.id);
    await db
      .update(purchaseLines)
      .set({ removedAt: new Date("2026-10-06T12:00:00.000Z") })
      .where(eq(purchaseLines.id, removed));

    const [listed] = await new DrizzlePurchasingListReader(db).purchases(locationId);

    expect(listed?.lines.map(({ id }) => id)).toEqual([kept]);
  });

  it("reads a line's lot from its own lot that was not withdrawn", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchaseId = await storedPurchase();
    const line = await lineOf(purchaseId, yerba.id, 1);
    const withdrawn = await lotOfLine(line, yerba.id);
    await db.update(lots).set({ withdrawn: true, remaining: 0 }).where(eq(lots.id, withdrawn));
    const current = await lotOfLine(line, yerba.id);

    const [listed] = await new DrizzlePurchasingListReader(db).purchases(locationId);

    expect(listed?.lines).toHaveLength(1);
    expect(listed?.lines[0]?.lotId).toBe(current);
  });
});
