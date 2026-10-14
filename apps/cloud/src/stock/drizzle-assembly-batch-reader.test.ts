import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleAssemblyBatchReader } from "./drizzle-assembly-batch-reader.js";
import { insertAssemblyBatch } from "./test-support/assembly-batch-fixtures.js";
import {
  insertInitialCountLot,
  insertPurchasedLot,
  insertTechnicalLot,
} from "./test-support/lot-fixtures.js";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");

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

async function seeded() {
  const { userId: actorId, locationId } = await signedInWith(db, [], NOW);
  const mix = await insertProduct(db, { name: "Mix de frutos secos", saleUnit: "KG" });
  const nuts = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });
  return { actorId, locationId, mix: mix.productId, nuts: nuts.productId };
}

const MAY = {
  from: new Date("2026-05-01T00:00:00.000Z"),
  to: new Date("2026-06-01T00:00:00.000Z"),
};

describe("DrizzleAssemblyBatchReader.batches", () => {
  it("lists a batch with its product, its unit cost and its expiry", async () => {
    const { actorId, locationId, mix } = await seeded();
    const { batchId } = await insertAssemblyBatch(db, {
      productId: mix,
      locationId,
      actorId,
      assembledAt: new Date("2026-05-04T13:00:00.000Z"),
      cost: { totalCents: 50_200, quantity: 14_000 },
      expiresOn: "2027-01-15",
    });

    const listed = await new DrizzleAssemblyBatchReader(db).batches({ locationId, ...MAY });

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: batchId,
      productId: mix,
      productName: "Mix de frutos secos",
      saleUnit: "KG",
      assembledAt: new Date("2026-05-04T13:00:00.000Z"),
      output: 14_000,
      unitCostCents: 3_586,
      costIncomplete: false,
      expiresOn: "2027-01-15",
    });
  });

  it("answers no unit cost for a batch whose cost is incomplete", async () => {
    const { actorId, locationId, mix } = await seeded();
    await insertAssemblyBatch(db, {
      productId: mix,
      locationId,
      actorId,
      assembledAt: new Date("2026-05-04T13:00:00.000Z"),
      cost: { totalCents: 200, quantity: 14_000 },
      costIncomplete: true,
    });

    const [listed] = await new DrizzleAssemblyBatchReader(db).batches({ locationId, ...MAY });

    expect(listed).toMatchObject({ unitCostCents: null, costIncomplete: true });
  });

  it("keeps to the location and to the period, from its first moment up to but not including its end", async () => {
    const { actorId, locationId, mix } = await seeded();
    const otherLocationId = await insertLocation(db);
    const make = (at: string, location = locationId) =>
      insertAssemblyBatch(db, {
        productId: mix,
        locationId: location,
        actorId,
        assembledAt: new Date(at),
      });
    const first = await make("2026-05-01T00:00:00.000Z");
    const last = await make("2026-05-31T23:59:59.000Z");
    await make("2026-06-01T00:00:00.000Z");
    await make("2026-04-30T23:59:59.000Z");
    await make("2026-05-10T00:00:00.000Z", otherLocationId);

    const listed = await new DrizzleAssemblyBatchReader(db).batches({ locationId, ...MAY });

    expect(listed.map((batch) => batch.id).sort()).toEqual([first.batchId, last.batchId].sort());
  });
});

describe("DrizzleAssemblyBatchReader.productLots", () => {
  it("answers each lot of the product at the location with its cost, whether it is incomplete and what it holds", async () => {
    const { actorId, locationId, nuts, mix } = await seeded();
    const otherLocationId = await insertLocation(db);
    const purchased = await insertPurchasedLot(db, {
      productId: nuts,
      locationId,
      actorId,
      expiresOn: "2027-01-15",
      remaining: 5_000,
    });
    const counted = await insertInitialCountLot(db, { productId: nuts, locationId, actorId });
    const technical = await insertTechnicalLot(db, {
      productId: nuts,
      locationId,
      remaining: -500,
    });
    await insertPurchasedLot(db, { productId: nuts, locationId: otherLocationId, actorId });
    await insertPurchasedLot(db, { productId: mix, locationId, actorId });

    const found = await new DrizzleAssemblyBatchReader(db).productLots({
      productId: nuts,
      locationId,
    });

    expect(found).toHaveLength(3);
    expect(found.find((lot) => lot.id === purchased)).toMatchObject({
      technical: false,
      expiresOn: "2027-01-15",
      purchasedOn: "2026-10-01",
      remaining: 5_000,
      cost: { totalCents: 5_000, quantity: 1_000 },
      costIncomplete: false,
    });
    expect(found.find((lot) => lot.id === counted.lotId)).toMatchObject({
      cost: null,
      costIncomplete: true,
    });
    expect(found.find((lot) => lot.id === technical)).toMatchObject({
      technical: true,
      remaining: -500,
      cost: null,
      costIncomplete: true,
    });
  });
});
