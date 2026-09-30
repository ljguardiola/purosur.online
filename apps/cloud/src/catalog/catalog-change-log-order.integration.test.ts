import { createProduct, editProduct } from "@purosur/domain/catalog/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

const UNIQUE_VIOLATION = "23505";

// PGlite serializes every query on one connection, so where a lock is taken can only be observed
// against a real Postgres pool.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("catalog_change_log_order");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("editing a product while another writer holds the change log, on a real Postgres", () => {
  it("has already written the product and its barcodes when it starts waiting for the log", async () => {
    const store = new DrizzleCatalogStore(db);
    const category = await store.transaction(async (tx) => tx.insertCategory("Almacén", null));
    const created = await createProduct(store, {
      name: "Arroz",
      categoryId: category.id,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7790001000011"],
      netContent: null,
    });
    if (created.kind !== "created") {
      throw new Error("test setup: the product was not created");
    }
    const productId = created.product.id;

    const holder = await sql.reserve();
    await holder`begin`;
    await holder`select pg_advisory_xact_lock(hashtextextended('changes_log', 0))`;
    const edit = editProduct(store, {
      id: productId,
      name: "Arroz largo fino",
      categoryId: category.id,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7790001000011", "7790001000028"],
      netContent: null,
      version: 1,
    });
    let claimNewBarcode: Promise<unknown> = Promise.resolve();
    try {
      await waitForLockWaiters(sql, 1);
      claimNewBarcode = sql`
        insert into product_barcodes (product_id, position, code)
        values (${productId}, 5, '7790001000028')`.then(
        () => undefined,
        (error: { code?: string }) => error.code,
      );
      await waitForLockWaiters(sql, 2);
    } finally {
      await holder`rollback`;
      holder.release();
    }

    await expect(edit).resolves.toMatchObject({ kind: "applied" });
    await expect(claimNewBarcode).resolves.toBe(UNIQUE_VIOLATION);
  });
});
