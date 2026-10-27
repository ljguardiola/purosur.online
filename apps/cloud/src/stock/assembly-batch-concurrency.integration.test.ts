import {
  recordLoss,
  registerAssemblyBatch,
  saveRecipe,
  voidAssemblyBatch,
} from "@purosur/domain/stock/use-cases";
import { eq, inArray, sql as sqlExpression } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assemblyBatches,
  lotAllocations,
  lots,
  stockBalances,
  stockMovements,
} from "../platform/db/schema.js";
import { insertActor, insertProduct } from "../purchasing/test-support/purchasing-fixtures.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAssemblyBatchStore } from "./drizzle-assembly-batch-store.js";
import { DrizzleRecipeStore } from "./drizzle-recipe-store.js";
import { DrizzleStockStore } from "./drizzle-stock-store.js";
import { insertPurchasedLot } from "./test-support/lot-fixtures.js";

// PGlite serializes all transactions on one connection, so only a real Postgres pool can interleave
// batches that consume the same component lots.
const now = () => new Date("2026-10-15T15:00:00Z");
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("assembly_batch_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function recipeOf(
  actorId: string,
  name: string,
  components: { id: string; quantity: number }[],
): Promise<string> {
  const product = await insertProduct(db, { name, saleUnit: "KG" });
  await saveRecipe(new DrizzleRecipeStore(db, now), {
    productId: product.id,
    components: components.map(({ id, quantity }) => ({
      componentProductId: id,
      quantityPerOutputUnit: quantity,
    })),
    version: null,
    actorId,
  });
  return product.id;
}

function batchOf(
  actorId: string,
  locationId: string,
  productId: string,
  used: { id: string; quantity: number }[],
) {
  return registerAssemblyBatch(
    { store: new DrizzleAssemblyBatchStore(db), clock: { now } },
    {
      productId,
      locationId,
      recipeVersion: 1,
      used: used.map(({ id, quantity }) => ({ componentProductId: id, quantity })),
      output: used.reduce((sum, { quantity }) => sum + quantity, 0),
      actorId,
    },
  );
}

describe("assembled batches sharing component lots, made at the same time on a real Postgres", () => {
  it("each lower the shared lots, none overwriting another, and none waiting on another forever", async () => {
    const actorId = await insertActor(db);
    const locationId = await seededLocationId(db);
    const nuts = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });
    const raisins = await insertProduct(db, { name: "Pasas", saleUnit: "KG" });
    const nutsLot = await insertPurchasedLot(db, {
      productId: nuts.id,
      locationId,
      actorId,
      remaining: 10_000,
    });
    const raisinsLot = await insertPurchasedLot(db, {
      productId: raisins.id,
      locationId,
      actorId,
      remaining: 10_000,
    });
    const nutsFirst = await recipeOf(actorId, "Mix A", [
      { id: nuts.id, quantity: 500 },
      { id: raisins.id, quantity: 500 },
    ]);
    const raisinsFirst = await recipeOf(actorId, "Mix B", [
      { id: raisins.id, quantity: 500 },
      { id: nuts.id, quantity: 500 },
    ]);
    const used = [
      { id: nuts.id, quantity: 500 },
      { id: raisins.id, quantity: 500 },
    ];

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        batchOf(actorId, locationId, index % 2 === 0 ? nutsFirst : raisinsFirst, used),
      ),
    );

    expect(outcomes.map((outcome) => outcome.kind)).toEqual(Array(8).fill("recorded"));
    const remaining = await db
      .select({ id: lots.id, remaining: lots.remaining })
      .from(lots)
      .where(inArray(lots.id, [nutsLot, raisinsLot]));
    expect(remaining.map((lot) => lot.remaining)).toEqual([6_000, 6_000]);
    expect(await db.select().from(assemblyBatches)).toHaveLength(8);
    const consumed = await db
      .select({ quantity: lotAllocations.quantity })
      .from(lotAllocations)
      .where(eq(lotAllocations.lotId, nutsLot));
    expect(consumed).toEqual(Array(8).fill({ quantity: -500 }));
    const balances = await db
      .select({ productId: stockBalances.productId, quantity: stockBalances.quantity })
      .from(stockBalances);
    expect(balances.find((row) => row.productId === nuts.id)?.quantity).toBe(-4_000);
  });
});

describe("voiding a batch on a real Postgres", () => {
  async function untouchedBatch() {
    const actorId = await insertActor(db);
    const locationId = await seededLocationId(db);
    const nuts = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });
    await insertPurchasedLot(db, {
      productId: nuts.id,
      locationId,
      actorId,
      remaining: 10_000,
    });
    await db.insert(stockBalances).values({ productId: nuts.id, locationId, quantity: 10_000 });
    const mix = await recipeOf(actorId, "Mix", [{ id: nuts.id, quantity: 1_000 }]);
    const recorded = await batchOf(actorId, locationId, mix, [{ id: nuts.id, quantity: 8_000 }]);
    if (recorded.kind !== "recorded") {
      throw new Error("test setup: the batch was not recorded");
    }
    return { actorId, locationId, nuts: nuts.id, mix, batchId: recorded.batch.id };
  }

  function voidOf(setUp: Awaited<ReturnType<typeof untouchedBatch>>) {
    return voidAssemblyBatch(
      { store: new DrizzleAssemblyBatchStore(db), clock: { now } },
      { batchId: setUp.batchId, locationId: setUp.locationId, actorId: setUp.actorId },
    );
  }

  async function lotDrift() {
    const rows = await db
      .select({
        id: lots.id,
        drift: sqlExpression<number>`${lots.remaining} - coalesce((select sum(${lotAllocations.quantity}) from ${lotAllocations} where ${lotAllocations.lotId} = ${lots.id}), 0)`,
      })
      .from(lots);
    return Object.fromEntries(rows.map((row) => [row.id, Number(row.drift)]));
  }

  it("voids a batch once when two voids race for it, recording its movements once", async () => {
    const setUp = await untouchedBatch();

    const outcomes = await Promise.all(Array.from({ length: 4 }, () => voidOf(setUp)));

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual([
      "already_voided",
      "already_voided",
      "already_voided",
      "voided",
    ]);
    const voids = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.assemblyBatchId, setUp.batchId));
    expect(voids.filter((movement) => movement.kind === "assembly_void")).toHaveLength(2);
    const balances = Object.fromEntries(
      (await db.select().from(stockBalances)).map((row) => [row.productId, row.quantity]),
    );
    expect(balances).toMatchObject({ [setUp.nuts]: 10_000, [setUp.mix]: 0 });
  });

  it("leaves the ledger consistent when a loss of the batch's finished product races its void", async () => {
    const setUp = await untouchedBatch();
    const driftBefore = await lotDrift();

    const [voided] = await Promise.all([
      voidOf(setUp),
      recordLoss(
        { store: new DrizzleStockStore(db), clock: { now } },
        {
          productId: setUp.mix,
          locationId: setUp.locationId,
          reason: "spoiled",
          quantity: 1_000,
          actorId: setUp.actorId,
        },
      ),
    ]);

    expect(["voided", "consumed"]).toContain(voided.kind);
    const [batch] = await db
      .select()
      .from(assemblyBatches)
      .where(eq(assemblyBatches.id, setUp.batchId));
    expect(batch?.voidedAt !== null).toBe(voided.kind === "voided");
    expect(await lotDrift()).toEqual(driftBefore);
    const movements = await db
      .select()
      .from(stockMovements)
      .where(inArray(stockMovements.productId, [setUp.nuts, setUp.mix]));
    const balances = await db
      .select()
      .from(stockBalances)
      .where(inArray(stockBalances.productId, [setUp.nuts, setUp.mix]));
    for (const { productId, quantity } of balances) {
      const initial = productId === setUp.nuts ? 10_000 : 0;
      const moved = movements
        .filter((movement) => movement.productId === productId)
        .reduce((sum, movement) => sum + movement.delta, 0);
      expect(quantity).toBe(initial + moved);
    }
    const voidMovements = movements.filter(
      (movement) => movement.kind === "assembly_void" && movement.assemblyBatchId === setUp.batchId,
    );
    expect(voidMovements).toHaveLength(voided.kind === "voided" ? 2 : 0);
  });
});
