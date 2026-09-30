import { randomUUID } from "node:crypto";
import { createTag, editTag } from "@purosur/domain/catalog/use-cases";
import { sql as rawSql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tags } from "../platform/db/schema.js";
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
  integrationDb = await createIntegrationDatabase("tag_name_uniqueness");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("creating two tags with the same name concurrently on a real Postgres through postgres-js", () => {
  it("creates exactly one of them and reports the other as name_taken", async () => {
    const name = `Sin TACC ${randomUUID()}`;

    const outcomes = await Promise.all([
      createTag(new DrizzleCatalogStore(db), { name }),
      createTag(new DrizzleCatalogStore(db), { name: name.toUpperCase() }),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === "created")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "name_taken")).toHaveLength(1);
    const matching = await db
      .select()
      .from(tags)
      .where(rawSql`lower(${tags.name}) = lower(${name})`);
    expect(matching).toHaveLength(1);
  });
});

describe("renaming two tags to the same name concurrently on a real Postgres through postgres-js", () => {
  it("renames exactly one of them and reports the other as name_taken", async () => {
    const created = await Promise.all(
      ["Vegano", "Orgánico"].map((name) =>
        createTag(new DrizzleCatalogStore(db), { name: `${name} ${randomUUID()}` }),
      ),
    );
    const [first, second] = created.map((outcome) => {
      if (outcome.kind !== "created") {
        throw new Error("test setup: expected both tags to be created");
      }
      return outcome.tag;
    });
    if (!first || !second) {
      throw new Error("test setup: expected two tags");
    }
    const name = `Dulcor ${randomUUID()}`;

    const outcomes = await Promise.all([
      editTag(new DrizzleCatalogStore(db), { id: first.id, name, version: 1 }),
      editTag(new DrizzleCatalogStore(db), {
        id: second.id,
        name: name.toUpperCase(),
        version: 1,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === "applied")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "name_taken")).toHaveLength(1);
  });
});
