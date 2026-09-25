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

// PGlite runs every query over one connection, so it can never race two creations for the same
// name. This runs them over a real postgres-js pool of more than one connection against a real
// Postgres, so the name each one races for is caught either by the transaction's own
// case-insensitive check or, when both slip past it concurrently, by the database's unique index
// on `lower(categories.name)` — reported as `constraint_name` by postgres-js, unlike PGlite's
// `constraint`, which is what `isCategoryNameUniqueViolation` (in `category-creation-route.ts`)
// must map correctly for this driver too.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("category_name_uniqueness");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("creating two categories with the same name concurrently on a real Postgres through postgres-js", () => {
  it("creates exactly one of them and reports the other as name_taken", async () => {
    const suffix = randomUUID();
    const name = `Semillas ${suffix}`;

    const [first, second] = await Promise.all([
      createCategory(db, { name, parentId: null }),
      createCategory(db, { name: name.toUpperCase(), parentId: null }),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.kind === "created")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "name_taken")).toHaveLength(1);

    const winner = outcomes.find((outcome) => outcome.kind === "created");
    if (winner?.kind !== "created") {
      throw new Error("test setup: expected one creation to have won the race");
    }
    const matchingCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.name, winner.category.name));
    expect(matchingCategories).toHaveLength(1);
  });
});

describe("creating two categories with the same name under two different parents concurrently on a real Postgres", () => {
  it("creates both, since sibling uniqueness is scoped per parent, not global", async () => {
    const suffix = randomUUID();
    const [parentA, parentB] = await Promise.all([
      createCategory(db, { name: `Almacén ${suffix}`, parentId: null }),
      createCategory(db, { name: `Limpieza ${suffix}`, parentId: null }),
    ]);
    if (parentA.kind !== "created" || parentB.kind !== "created") {
      throw new Error("test setup: expected both parent categories to be created");
    }
    const name = `Repuesto ${suffix}`;

    const [underA, underB] = await Promise.all([
      createCategory(db, { name, parentId: parentA.category.id }),
      createCategory(db, { name, parentId: parentB.category.id }),
    ]);

    expect(underA.kind).toBe("created");
    expect(underB.kind).toBe("created");
    const matchingCategories = await db.select().from(categories).where(eq(categories.name, name));
    expect(matchingCategories).toHaveLength(2);
  });
});
