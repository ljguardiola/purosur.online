import { saveRecipe } from "@purosur/domain/stock/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recipes } from "../platform/db/schema.js";
import { insertActor, insertProduct } from "../purchasing/test-support/purchasing-fixtures.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleRecipeStore } from "./drizzle-recipe-store.js";

// PGlite serializes every query on one connection, so two saves can only race on a real Postgres
// pool; the test pins that race by holding the assembled product's row lock until both queue.
const now = () => new Date("2026-10-15T15:00:00Z");
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let actorId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("recipe_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
  actorId = await insertActor(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function firstRecipeOf(
  productId: string,
  componentProductId: string,
  quantityPerOutputUnit: number,
) {
  return () =>
    saveRecipe(new DrizzleRecipeStore(db, now), {
      productId,
      components: [{ componentProductId, quantityPerOutputUnit }],
      version: null,
      actorId,
    });
}

describe("two people saving the first recipe of the same product at once, on a real Postgres", () => {
  it("saves the first and refuses the second as stale, keeping the first recipe", async () => {
    const mix = await insertProduct(db, { name: "Mix de frutos secos", saleUnit: "KG" });
    const nuts = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });
    const raisins = await insertProduct(db, { name: "Pasas", saleUnit: "KG" });

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      (connection) => connection`select id from products where id = ${mix.id} for update`,
      firstRecipeOf(mix.id, nuts.id, 600),
      firstRecipeOf(mix.id, raisins.id, 400),
    );

    expect(first.kind).toBe("saved");
    expect(second).toEqual({ kind: "stale_version" });
    expect(await db.select().from(recipes)).toMatchObject([{ productId: mix.id, version: 1 }]);
  });
});
