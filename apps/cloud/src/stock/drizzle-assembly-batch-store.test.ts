import { registerAssemblyBatch, saveRecipe } from "@purosur/domain/stock/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assemblyBatches,
  assemblyBatchLines,
  changes,
  lotAllocations,
  lots,
  stockBalances,
  stockMovements,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleAssemblyBatchStore } from "./drizzle-assembly-batch-store.js";
import { DrizzleRecipeStore } from "./drizzle-recipe-store.js";
import { insertPurchasedLot, insertTechnicalLot } from "./test-support/lot-fixtures.js";
import { insertBalance, insertProduct, signedInWith } from "./test-support/stock-route-fixtures.js";

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

async function seededMix() {
  const { userId: actorId, locationId } = await signedInWith(db, [], NOW);
  const mix = await insertProduct(db, { name: "Mix", saleUnit: "KG" });
  const nuts = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });
  const bag = await insertProduct(db, { name: "Bolsa", saleUnit: "UNIT" });
  await saveRecipe(new DrizzleRecipeStore(db, () => NOW), {
    productId: mix.productId,
    components: [
      { componentProductId: nuts.productId, quantityPerOutputUnit: 600 },
      { componentProductId: bag.productId, quantityPerOutputUnit: 1_000 },
    ],
    version: null,
    actorId,
  });
  const soon = await insertPurchasedLot(db, {
    productId: nuts.productId,
    locationId,
    actorId,
    expiresOn: "2027-01-15",
    remaining: 5_000,
  });
  const late = await insertPurchasedLot(db, {
    productId: nuts.productId,
    locationId,
    actorId,
    expiresOn: "2027-03-01",
    remaining: 10_000,
  });
  await insertPurchasedLot(db, {
    productId: bag.productId,
    locationId,
    actorId,
    remaining: 50_000,
  });
  await insertBalance(db, { productId: nuts.productId, locationId, quantity: 15_000 });
  await insertBalance(db, { productId: bag.productId, locationId, quantity: 50_000 });
  return {
    actorId,
    locationId,
    mix: mix.productId,
    nuts: nuts.productId,
    bag: bag.productId,
    soon,
    late,
  };
}

function register(
  seeded: Awaited<ReturnType<typeof seededMix>>,
  overrides: { recipeVersion?: number; output?: number } = {},
) {
  return registerAssemblyBatch(
    { store: new DrizzleAssemblyBatchStore(db), clock: { now: () => NOW } },
    {
      productId: seeded.mix,
      locationId: seeded.locationId,
      recipeVersion: overrides.recipeVersion ?? 1,
      used: [
        { componentProductId: seeded.nuts, quantity: 12_000 },
        { componentProductId: seeded.bag, quantity: 2_000 },
      ],
      output: overrides.output ?? 14_000,
      actorId: seeded.actorId,
    },
  );
}

describe("DrizzleAssemblyBatchStore", () => {
  it("records the batch with its lines, the movements linked to it, and the batch's own lot", async () => {
    const seeded = await seededMix();

    const outcome = await register(seeded);

    expect(outcome.kind).toBe("recorded");
    const [batch] = await db.select().from(assemblyBatches);
    expect(batch).toMatchObject({
      productId: seeded.mix,
      locationId: seeded.locationId,
      assembledAt: NOW,
      outputQty: 14_000,
      actorId: seeded.actorId,
    });
    const lines = await db.select().from(assemblyBatchLines);
    expect(lines.map((line) => [line.componentProductId, line.quantity]).sort()).toEqual(
      [
        [seeded.nuts, 12_000],
        [seeded.bag, 2_000],
      ].sort(),
    );
    const movements = await db.select().from(stockMovements);
    expect(
      movements.map((movement) => [movement.kind, movement.delta, movement.assemblyBatchId]),
    ).toEqual(
      expect.arrayContaining([
        ["assembly_out", -12_000, batch?.id],
        ["assembly_out", -2_000, batch?.id],
        ["assembly_in", 14_000, batch?.id],
      ]),
    );
    const [batchLot] = await db
      .select()
      .from(lots)
      .where(eq(lots.assemblyBatchId, batch?.id as string));
    expect(batchLot).toMatchObject({
      productId: seeded.mix,
      quantityReceived: 14_000,
      remaining: 14_000,
      costTotalCents: 70_000,
      costQuantity: 14_000,
      costIncomplete: false,
      expiresOn: "2027-01-15",
      lotNumber: null,
    });
  });

  it("consumes the component lots, moves the balances and leaves the allocations", async () => {
    const seeded = await seededMix();

    await register(seeded);

    const remaining = Object.fromEntries(
      (await db.select().from(lots)).map((lot) => [lot.id, lot.remaining]),
    );
    expect(remaining[seeded.soon]).toBe(0);
    expect(remaining[seeded.late]).toBe(3_000);
    const balances = Object.fromEntries(
      (await db.select().from(stockBalances)).map((row) => [row.productId, row.quantity]),
    );
    expect(balances).toMatchObject({
      [seeded.nuts]: 3_000,
      [seeded.bag]: 48_000,
      [seeded.mix]: 14_000,
    });
    expect(await db.select().from(lotAllocations)).toHaveLength(4);
  });

  it("logs each movement of the batch for the registers of the branch to pull", async () => {
    const seeded = await seededMix();
    const before = (await db.select().from(changes).where(eq(changes.entity, "stock_movement")))
      .length;

    await register(seeded);

    const logged = await db.select().from(changes).where(eq(changes.entity, "stock_movement"));
    expect(logged.length - before).toBe(3);
  });

  it("marks the batch's lot incomplete when a consumed lot was technical", async () => {
    const seeded = await seededMix();
    await db.delete(lots).where(eq(lots.id, seeded.soon));
    await db.delete(lots).where(eq(lots.id, seeded.late));
    await insertTechnicalLot(db, {
      productId: seeded.nuts,
      locationId: seeded.locationId,
      remaining: 0,
    });

    const outcome = await register(seeded);

    expect(outcome).toMatchObject({ kind: "recorded", batch: { costIncomplete: true } });
    const [batchLot] = await db.select().from(lots).where(eq(lots.productId, seeded.mix));
    expect(batchLot).toMatchObject({ costIncomplete: true, costTotalCents: 10_000 });
  });

  it("writes nothing when the recipe changed since it was loaded", async () => {
    const seeded = await seededMix();

    const outcome = await register(seeded, { recipeVersion: 7 });

    expect(outcome).toEqual({ kind: "stale_recipe" });
    expect(await db.select().from(assemblyBatches)).toEqual([]);
    expect(await db.select().from(stockMovements)).toEqual([]);
  });

  it("writes nothing, not even the balance rows it locked, when the batch's first write is refused", async () => {
    const seeded = await seededMix();

    await expect(
      register({ ...seeded, actorId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toThrow();

    expect(await db.select().from(assemblyBatches)).toEqual([]);
    expect(await db.select().from(stockMovements)).toEqual([]);
    expect(
      await db.select().from(stockBalances).where(eq(stockBalances.productId, seeded.mix)),
    ).toEqual([]);
  });
});
