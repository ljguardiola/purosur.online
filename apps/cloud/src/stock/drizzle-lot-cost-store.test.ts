import { setLotReferenceCost } from "@purosur/domain/stock/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lots } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleLotCostStore } from "./drizzle-lot-cost-store.js";
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
  const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
  const { productId } = await insertProduct(db);
  return { actorId, locationId, productId };
}

describe("DrizzleLotCostStore.lockLot", () => {
  it("tells where a lot came from, whether it was withdrawn and what it still holds, from its columns", async () => {
    const { actorId, locationId, productId } = await seeded();
    const initial = await insertInitialCountLot(db, { productId, locationId, actorId });
    const withdrawn = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId,
      withdrawn: true,
      remaining: -250,
    });
    const purchased = await insertPurchasedLot(db, { productId, locationId, actorId });
    const technical = await insertTechnicalLot(db, { productId, locationId, remaining: 0 });
    const assembled = await insertAssemblyBatch(db, {
      productId,
      locationId,
      actorId,
      assembledAt: new Date("2026-05-04T13:00:00.000Z"),
    });
    const store = new DrizzleLotCostStore(db);

    const locked = await store.transaction(async (tx) => ({
      initial: await tx.lockLot(locationId, initial.lotId),
      withdrawn: await tx.lockLot(locationId, withdrawn.lotId),
      purchased: await tx.lockLot(locationId, purchased),
      technical: await tx.lockLot(locationId, technical),
      assembled: await tx.lockLot(locationId, assembled.lotId),
    }));

    expect(locked).toEqual({
      initial: { origin: "initial_count", withdrawn: false, remaining: 6_000 },
      withdrawn: { origin: "initial_count", withdrawn: true, remaining: -250 },
      purchased: { origin: "purchase", withdrawn: false, remaining: 10_000 },
      technical: { origin: "technical", withdrawn: false, remaining: 0 },
      assembled: { origin: "assembly_batch", withdrawn: false, remaining: 14_000 },
    });
  });

  it("finds nothing for a lot of another branch or one that does not exist", async () => {
    const { actorId, locationId, productId } = await seeded();
    const otherLocationId = await insertLocation(db);
    const { lotId } = await insertInitialCountLot(db, { productId, locationId, actorId });
    const store = new DrizzleLotCostStore(db);

    const found = await store.transaction(async (tx) => [
      await tx.lockLot(otherLocationId, lotId),
      await tx.lockLot(locationId, "00000000-0000-4000-8000-000000000000"),
    ]);

    expect(found).toEqual([undefined, undefined]);
  });
});

describe("DrizzleLotCostStore.setReferenceCost", () => {
  it("writes the unit cost as the lot's cost pair and completes its cost", async () => {
    const { actorId, locationId, productId } = await seeded();
    const { lotId } = await insertInitialCountLot(db, { productId, locationId, actorId });

    const outcome = await setLotReferenceCost(
      { store: new DrizzleLotCostStore(db) },
      { locationId, lotId, unitCostCents: 3_500 },
    );

    expect(outcome).toEqual({ kind: "set" });
    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId));
    expect(lot).toMatchObject({
      costTotalCents: 3_500,
      costQuantity: 1_000,
      costIncomplete: false,
    });
  });

  it("changes nothing in a lot of purchase", async () => {
    const { actorId, locationId, productId } = await seeded();
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId });

    const outcome = await setLotReferenceCost(
      { store: new DrizzleLotCostStore(db) },
      { locationId, lotId, unitCostCents: 3_500 },
    );

    expect(outcome).toEqual({ kind: "not_an_initial_count_lot" });
    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId));
    expect(lot).toMatchObject({ costTotalCents: 5_000, costQuantity: 1_000 });
  });
});
