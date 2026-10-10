import { randomUUID } from "node:crypto";
import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { createSupplier, editSupplier } from "@purosur/domain/purchasing/use-cases";
import { sql as rawSql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suppliers } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";

// PGlite can't race two writes for the same name, so this runs on a real postgres-js pool, whose
// driver reports the violated index as `constraint_name` rather than PGlite's `constraint`.
const now = () => new Date("2026-10-15T15:00:00Z");
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let actorId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("supplier_uniqueness");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  actorId = await insertActor(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function supplierFields(name: string, cuit: string | null = null) {
  return { name, cuit, contact: null, note: null, actorId };
}

describe("creating two suppliers with the same name concurrently on a real Postgres through postgres-js", () => {
  it("creates exactly one of them and reports the other as name_taken", async () => {
    const name = `Distribuidora ${randomUUID()}`;

    const outcomes = await Promise.all([
      createSupplier(new DrizzlePurchasingStore(db, now), supplierFields(name)),
      createSupplier(new DrizzlePurchasingStore(db, now), supplierFields(name.toUpperCase())),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === "created")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "name_taken")).toHaveLength(1);
    expect(
      await db.select().from(suppliers).where(rawSql`lower(${suppliers.name}) = lower(${name})`),
    ).toHaveLength(1);
  });
});

describe("creating two suppliers with the same tax id concurrently on a real Postgres through postgres-js", () => {
  it("creates exactly one of them and reports the other as cuit_taken", async () => {
    const cuit = FICTIONAL_CUIT;

    const outcomes = await Promise.all([
      createSupplier(
        new DrizzlePurchasingStore(db, now),
        supplierFields(`Uno ${randomUUID()}`, cuit),
      ),
      createSupplier(
        new DrizzlePurchasingStore(db, now),
        supplierFields(`Dos ${randomUUID()}`, cuit),
      ),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === "created")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "cuit_taken")).toHaveLength(1);
  });
});

describe("renaming two suppliers to the same name concurrently on a real Postgres through postgres-js", () => {
  it("renames exactly one of them and reports the other as name_taken", async () => {
    const created = await Promise.all(
      ["Uno", "Dos"].map((name) =>
        createSupplier(
          new DrizzlePurchasingStore(db, now),
          supplierFields(`${name} ${randomUUID()}`),
        ),
      ),
    );
    const [first, second] = created.map((outcome) => {
      if (outcome.kind !== "created") {
        throw new Error("test setup: expected both suppliers to be created");
      }
      return outcome.supplier;
    });
    if (!first || !second) {
      throw new Error("test setup: expected two suppliers");
    }
    const name = `Nueva ${randomUUID()}`;

    const outcomes = await Promise.all([
      editSupplier(new DrizzlePurchasingStore(db, now), {
        ...supplierFields(name),
        id: first.id,
        version: 1,
      }),
      editSupplier(new DrizzlePurchasingStore(db, now), {
        ...supplierFields(name.toUpperCase()),
        id: second.id,
        version: 1,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === "applied")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "name_taken")).toHaveLength(1);
  });
});
