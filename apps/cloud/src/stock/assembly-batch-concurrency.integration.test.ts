import { registerAssemblyBatch, saveRecipe } from "@purosur/domain/stock/use-cases";
import { eq, inArray } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assemblyBatches, lotAllocations, lots, stockBalances } from "../platform/db/schema.js";
import { insertActor, insertProduct } from "../purchasing/test-support/purchasing-fixtures.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAssemblyBatchStore } from "./drizzle-assembly-batch-store.js";
import { DrizzleRecipeStore } from "./drizzle-recipe-store.js";
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
