import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { allocateInternalBarcode } from "./internal-barcode-route.js";

// A Postgres sequence's `nextval` is concurrency-safe: each caller gets its own value with no
// locking needed.
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
    const codes = await Promise.all(Array.from({ length: 20 }, () => allocateInternalBarcode(db)));

    expect(new Set(codes).size).toBe(codes.length);
  });
});
