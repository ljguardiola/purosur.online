import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { allocateInternalBarcode } from "./internal-barcode-route.js";

// A Postgres sequence's `nextval` is itself concurrency-safe (each caller gets its own value, with
// no locking needed), so this proves that guarantee holds end to end for `allocateInternalBarcode`
// running over a real multi-connection pool against a real Postgres, the same shape
// `product-barcode-uniqueness.integration.test.ts` uses to prove the barcode-uniqueness race.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("internal_barcode_allocation");
  sql = postgres(integrationDb.databaseUrl, { max: 8 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("allocating internal barcodes concurrently on a real Postgres through postgres-js", () => {
  it("gives every concurrent allocation its own distinct code", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () => allocateInternalBarcode(db)),
    );

    const codes = outcomes.map((outcome) => {
      if (outcome.kind !== "allocated") {
        throw new Error(`test setup: expected every allocation to succeed, got ${outcome.kind}`);
      }
      return outcome.code;
    });
    expect(new Set(codes).size).toBe(codes.length);
  });
});
