import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assemblyBatches, lotAllocations } from "../platform/db/schema.js";
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
  insertMovement,
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

describe("DrizzleAssemblyBatchReader.batches voided and consumed", () => {
  type Context = Awaited<ReturnType<typeof seeded>>;

  async function batchOf(context: Context, at = "2026-05-04T13:00:00.000Z") {
    const { actorId, locationId, mix } = context;
    const batch = await insertAssemblyBatch(db, {
      productId: mix,
      locationId,
      actorId,
      assembledAt: new Date(at),
    });
    return { actorId, locationId, mix, ...batch };
  }

  async function listed(locationId: string) {
    return new DrizzleAssemblyBatchReader(db).batches({ locationId, ...MAY });
  }

  async function consume(
    batch: Awaited<ReturnType<typeof batchOf>>,
    kind: "adjustment" | "loss" | "assembly_out" | "assembly_in",
    delta: number,
    linkedTo = batch.batchId,
  ) {
    const movementId = await insertMovement(db, {
      productId: batch.mix,
      locationId: batch.locationId,
      actorId: batch.actorId,
      kind,
      reason: kind === "loss" ? "spoiled" : kind === "adjustment" ? "found" : null,
      delta,
      occurredAt: new Date("2026-05-05T10:00:00.000Z"),
      ...(kind === "assembly_out" || kind === "assembly_in" ? { assemblyBatchId: linkedTo } : {}),
    });
    await db.insert(lotAllocations).values({ movementId, lotId: batch.lotId, quantity: delta });
  }

  it("answers a batch nothing touched as neither voided nor consumed", async () => {
    const context = await seeded();
    const batch = await batchOf(context);

    const [found] = await listed(batch.locationId);

    expect(found).toMatchObject({ voided: false, lotConsumed: false });
  });

  it("answers a batch as voided once it was voided", async () => {
    const context = await seeded();
    const batch = await batchOf(context);
    await db
      .update(assemblyBatches)
      .set({ voidedAt: new Date("2026-05-05T10:00:00.000Z"), voidedBy: batch.actorId })
      .where(eq(assemblyBatches.id, batch.batchId));

    const [found] = await listed(batch.locationId);

    expect(found).toMatchObject({ voided: true, lotConsumed: false });
  });

  it("answers a batch as consumed when an adjustment or a loss took from its lot", async () => {
    const context = await seeded();
    const sold = await batchOf(context);
    await consume(sold, "adjustment", -1_000);
    const lost = await batchOf(context, "2026-05-06T13:00:00.000Z");
    await consume(lost, "loss", -500);

    const found = await listed(sold.locationId);

    expect(found.find((batch) => batch.id === sold.batchId)?.lotConsumed).toBe(true);
    expect(found.find((batch) => batch.id === lost.batchId)?.lotConsumed).toBe(true);
  });

  it("does not count as consumption an allocation of the batch's own assembly movement, nor another batch's consumption", async () => {
    const context = await seeded();
    const own = await batchOf(context);
    await consume(own, "assembly_in", 14_000);
    const untouched = await batchOf(context, "2026-05-06T13:00:00.000Z");

    const found = await listed(own.locationId);

    expect(found.find((batch) => batch.id === own.batchId)?.lotConsumed).toBe(false);
    expect(found.find((batch) => batch.id === untouched.batchId)?.lotConsumed).toBe(false);
  });

  it("counts as consumption a component use of the batch's lot by another batch's assembly", async () => {
    const context = await seeded();
    const batch = await batchOf(context);
    const other = await batchOf(context, "2026-05-06T13:00:00.000Z");
    await consume(batch, "assembly_out", -2_000, other.batchId);

    const found = await listed(batch.locationId);

    expect(found.find((listing) => listing.id === batch.batchId)?.lotConsumed).toBe(true);
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
