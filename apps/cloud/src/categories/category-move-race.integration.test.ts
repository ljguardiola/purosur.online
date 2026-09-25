import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { createCategory } from "./category-creation-route.js";
import { editCategory } from "./category-edit-route.js";

// PGlite runs every query over one connection, so it can never interleave two moves the way this
// test needs to. This runs them over a real postgres-js pool of more than one connection against a
// real Postgres, so `editCategory`'s fixed-key advisory lock (`CATEGORY_MOVE_LOCK_KEY`,
// `category-edit-route.ts`) is what has to serialize the two moves below, rather than PGlite's own
// single-connection serialization masking a race that would exist against a real database.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("category_move_race");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("moving two unrelated categories under each other concurrently on a real Postgres", () => {
  it("lets exactly one move win and rejects the other as a cycle, creating no cycle", async () => {
    const suffix = randomUUID();
    const [createdA, createdB] = await Promise.all([
      createCategory(db, { name: `Categoría A ${suffix}`, parentId: null }),
      createCategory(db, { name: `Categoría B ${suffix}`, parentId: null }),
    ]);
    if (createdA.kind !== "created" || createdB.kind !== "created") {
      throw new Error("test setup: expected both categories to be created");
    }
    const a = createdA.category;
    const b = createdB.category;

    const [moveAUnderB, moveBUnderA] = await Promise.all([
      editCategory(db, { id: a.id, name: a.name, parentId: b.id, version: a.version }),
      editCategory(db, { id: b.id, name: b.name, parentId: a.id, version: b.version }),
    ]);

    const outcomes = [moveAUnderB, moveBUnderA];
    expect(outcomes.filter((outcome) => outcome.kind === "applied")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "move_not_allowed")).toHaveLength(1);

    const rows = await db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, a.id));
    const [rowA] = rows;
    const [rowB] = await db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, b.id));
    // Never both: that would be the cycle this test exists to rule out.
    expect(rowA?.parentId === b.id && rowB?.parentId === a.id).toBe(false);
  });
});
