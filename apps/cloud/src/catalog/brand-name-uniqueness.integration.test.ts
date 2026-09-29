import { randomUUID } from "node:crypto";
import { createBrand, editBrand } from "@purosur/domain/catalog/use-cases";
import { sql as rawSql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brands } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

// PGlite can't race two creations for the same name, so this runs on a real postgres-js pool,
// whose driver reports the violated index as `constraint_name` rather than PGlite's `constraint`.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("brand_name_uniqueness");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("creating two brands with the same name concurrently on a real Postgres through postgres-js", () => {
  it("creates exactly one of them and reports the other as name_taken", async () => {
    const name = `Granix ${randomUUID()}`;

    const outcomes = await Promise.all([
      createBrand(new DrizzleCatalogStore(db), { name }),
      createBrand(new DrizzleCatalogStore(db), { name: name.toUpperCase() }),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === "created")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "name_taken")).toHaveLength(1);
    const matching = await db
      .select()
      .from(brands)
      .where(rawSql`lower(${brands.name}) = lower(${name})`);
    expect(matching).toHaveLength(1);
  });
});

describe("renaming two brands to the same name concurrently on a real Postgres through postgres-js", () => {
  it("renames exactly one of them and reports the other as name_taken", async () => {
    const created = await Promise.all(
      ["Vitaco", "Cabrales"].map((name) =>
        createBrand(new DrizzleCatalogStore(db), { name: `${name} ${randomUUID()}` }),
      ),
    );
    const [first, second] = created.map((outcome) => {
      if (outcome.kind !== "created") {
        throw new Error("test setup: expected both brands to be created");
      }
      return outcome.brand;
    });
    if (!first || !second) {
      throw new Error("test setup: expected two brands");
    }
    const name = `Dulcor ${randomUUID()}`;

    const outcomes = await Promise.all([
      editBrand(new DrizzleCatalogStore(db), { id: first.id, name, version: 1 }),
      editBrand(new DrizzleCatalogStore(db), {
        id: second.id,
        name: name.toUpperCase(),
        version: 1,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === "applied")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "name_taken")).toHaveLength(1);
  });
});
