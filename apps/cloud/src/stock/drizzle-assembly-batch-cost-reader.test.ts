import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assemblyBatches } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleAssemblyBatchCostReader } from "./drizzle-assembly-batch-cost-reader.js";
import { insertAssemblyBatch } from "./test-support/assembly-batch-fixtures.js";
import { insertInitialCountLot, insertPurchasedLot } from "./test-support/lot-fixtures.js";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

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
  const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
  const { productId } = await insertProduct(db);
  return { actorId, locationId, productId };
}

const assembledAt = new Date("2026-10-05T15:30:00.000Z");

describe("DrizzleAssemblyBatchCostReader.batchLotCostsOf", () => {
  it("answers a batch's lot with the batch and its assembly instant, its recorded cost and its state", async () => {
    const { actorId, locationId, productId } = await setUp();
    const { batchId } = await insertAssemblyBatch(db, {
      productId,
      locationId,
      actorId,
      assembledAt,
      output: 14_000,
      cost: { totalCents: 50_200, quantity: 14_000 },
    });

    const batches = await new DrizzleAssemblyBatchCostReader(db).batchLotCostsOf(locationId, [
      productId,
    ]);

    expect(batches).toEqual([
      {
        productId,
        batchId,
        assembledAt,
        cost: { totalCents: 50_200, quantity: 14_000 },
        costIncomplete: false,
      },
    ]);
  });

  it("answers a batch lot with an incomplete cost as incomplete, still with its recorded cost", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertAssemblyBatch(db, {
      productId,
      locationId,
      actorId,
      assembledAt,
      cost: { totalCents: 30_000, quantity: 14_000 },
      costIncomplete: true,
    });

    const batches = await new DrizzleAssemblyBatchCostReader(db).batchLotCostsOf(locationId, [
      productId,
    ]);

    expect(batches).toEqual([
      expect.objectContaining({
        costIncomplete: true,
        cost: { totalCents: 30_000, quantity: 14_000 },
      }),
    ]);
  });

  it("answers every batch of a product, each with its own instant", async () => {
    const { actorId, locationId, productId } = await setUp();
    const later = new Date("2026-10-06T10:00:00.000Z");
    await insertAssemblyBatch(db, { productId, locationId, actorId, assembledAt });
    await insertAssemblyBatch(db, { productId, locationId, actorId, assembledAt: later });

    const batches = await new DrizzleAssemblyBatchCostReader(db).batchLotCostsOf(locationId, [
      productId,
    ]);

    expect(batches.map((batch) => batch.assembledAt.toISOString()).sort()).toEqual([
      assembledAt.toISOString(),
      later.toISOString(),
    ]);
  });

  it("answers only the products asked for", async () => {
    const { actorId, locationId, productId } = await setUp();
    const { productId: otherId } = await insertProduct(db, { name: "Yerba 1 kg" });
    for (const id of [productId, otherId]) {
      await insertAssemblyBatch(db, { productId: id, locationId, actorId, assembledAt });
    }

    const batches = await new DrizzleAssemblyBatchCostReader(db).batchLotCostsOf(locationId, [
      otherId,
    ]);

    expect(batches.map((batch) => batch.productId)).toEqual([otherId]);
  });

  it("answers nothing when no product is asked for", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertAssemblyBatch(db, { productId, locationId, actorId, assembledAt });

    expect(await new DrizzleAssemblyBatchCostReader(db).batchLotCostsOf(locationId, [])).toEqual(
      [],
    );
  });

  it("answers only the branch's own batches", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertAssemblyBatch(db, {
      productId,
      locationId: await insertLocation(db),
      actorId,
      assembledAt,
    });

    expect(
      await new DrizzleAssemblyBatchCostReader(db).batchLotCostsOf(locationId, [productId]),
    ).toEqual([]);
  });

  it("answers no lot received from a purchase or an initial count", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertPurchasedLot(db, { productId, locationId, actorId });
    await insertInitialCountLot(db, { productId, locationId, actorId, unitCostCents: 300 });

    expect(
      await new DrizzleAssemblyBatchCostReader(db).batchLotCostsOf(locationId, [productId]),
    ).toEqual([]);
  });

  it("answers no batch lot that records no cost", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertAssemblyBatch(db, { productId, locationId, actorId, assembledAt, cost: null });

    expect(
      await new DrizzleAssemblyBatchCostReader(db).batchLotCostsOf(locationId, [productId]),
    ).toEqual([]);
  });

  it("does not answer the lot of a voided batch, which never happened", async () => {
    const { actorId, locationId, productId } = await setUp();
    const voided = await insertAssemblyBatch(db, {
      productId,
      locationId,
      actorId,
      assembledAt,
    });
    const kept = await insertAssemblyBatch(db, {
      productId,
      locationId,
      actorId,
      assembledAt: new Date("2026-10-04T10:00:00.000Z"),
    });
    await db
      .update(assemblyBatches)
      .set({ voidedAt: new Date("2026-10-06T10:00:00.000Z"), voidedBy: actorId })
      .where(eq(assemblyBatches.id, voided.batchId));

    const batches = await new DrizzleAssemblyBatchCostReader(db).batchLotCostsOf(locationId, [
      productId,
    ]);

    expect(batches.map((batch) => batch.batchId)).toEqual([kept.batchId]);
  });
});
