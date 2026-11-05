import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { purchaseLines } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchaseChangeReader } from "./drizzle-purchase-change-reader.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import { quantityLine, registeredPurchase } from "./test-support/registered-purchase.js";

const REGISTERED_AT = new Date("2026-10-02T12:00:00.000Z");

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

async function purchaseOf(productIds: string[], supplierName?: string) {
  const purchase = await registeredPurchase(
    {
      store: new DrizzlePurchasingStore(db, () => REGISTERED_AT),
      clock: { now: () => REGISTERED_AT },
      actorId,
      locationId,
    },
    productIds.map((productId) => quantityLine(productId)),
    supplierName,
  );
  const lines = await db
    .select({ id: purchaseLines.id })
    .from(purchaseLines)
    .where(eq(purchaseLines.purchaseId, purchase.id))
    .orderBy(asc(purchaseLines.position));
  return { purchaseId: purchase.id, lineIds: lines.map(({ id }) => id) };
}

describe("DrizzlePurchaseChangeReader.productOfEachLine", () => {
  it("answers the product each line of the purchase has now, a removed line included", async () => {
    const juice = await insertProduct(db, { name: "Jugo" });
    const flour = await insertProduct(db, { name: "Harina" });
    const nectar = await insertProduct(db, { name: "Néctar" });
    const { purchaseId, lineIds } = await purchaseOf([juice.id, flour.id]);
    await purchaseOf([juice.id], "Molinos del Valle");
    const [juiceLine, flourLine] = lineIds as [string, string];
    await db
      .update(purchaseLines)
      .set({ productId: nectar.id })
      .where(eq(purchaseLines.id, juiceLine));
    await db
      .update(purchaseLines)
      .set({ removedAt: new Date("2026-10-06T15:00:00.000Z") })
      .where(eq(purchaseLines.id, flourLine));

    const products = await new DrizzlePurchaseChangeReader(db).productOfEachLine(purchaseId);

    expect(products).toEqual(
      new Map([
        [juiceLine, nectar.id],
        [flourLine, flour.id],
      ]),
    );
  });
});

describe("DrizzlePurchaseChangeReader.describedProducts", () => {
  it("describes each product with its name, brand, net content and sale unit", async () => {
    const honey = await insertProduct(db, {
      name: "Miel pura de abeja",
      brandName: "Colmena del Sur",
      netContent: { quantity: 1, unit: "KG" },
    });
    const oats = await insertProduct(db, { name: "Avena arrollada", saleUnit: "KG" });
    await insertProduct(db, { name: "Harina" });

    const products = await new DrizzlePurchaseChangeReader(db).describedProducts([
      honey.id,
      oats.id,
    ]);

    expect(products).toEqual(
      new Map([
        [
          honey.id,
          {
            id: honey.id,
            name: "Miel pura de abeja",
            brandName: "Colmena del Sur",
            netContent: { quantity: 1, unit: "KG" },
            saleUnit: "UNIT",
          },
        ],
        [
          oats.id,
          {
            id: oats.id,
            name: "Avena arrollada",
            brandName: null,
            netContent: null,
            saleUnit: "KG",
          },
        ],
      ]),
    );
  });

  it("answers nothing when asked for no product", async () => {
    await insertProduct(db, { name: "Harina" });

    expect(await new DrizzlePurchaseChangeReader(db).describedProducts([])).toEqual(new Map());
  });
});
