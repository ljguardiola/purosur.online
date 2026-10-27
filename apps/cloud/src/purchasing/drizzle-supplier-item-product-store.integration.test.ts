import { randomUUID } from "node:crypto";
import { createProductFromSupplierItem } from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, productBarcodes, products } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleSupplierItemProductStore } from "./drizzle-supplier-item-product-store.js";
import { extractedListWithRow, storedListRow } from "./test-support/extracted-list-fixtures.js";

const NOW = new Date("2026-03-10T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("supplier_item_product_store");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("creating two products with the same barcode from two supplier items on a real Postgres", () => {
  it("creates one, answers barcode_taken for the other and leaves its row unlinked", async () => {
    const [category] = await db
      .insert(categories)
      .values({ name: `Almacén ${randomUUID()}` })
      .returning({ id: categories.id });
    if (!category) {
      throw new Error("test setup: seeding the category returned no row");
    }
    const code = randomUUID();
    const first = await extractedListWithRow(db, {}, { description: "Yerba A" });
    const second = await extractedListWithRow(db, {}, { description: "Yerba B" });

    const create = ({ listId, rowId, actorId }: typeof first) =>
      createProductFromSupplierItem(new DrizzleSupplierItemProductStore(db, () => NOW), {
        listId,
        rowId,
        version: 1,
        saleUnit: "UNIT",
        categoryId: category.id,
        barcodes: [code],
        packagingName: "Paquete",
        quantityPerPackage: 1_000,
        vatRate: 2_100,
        actorId,
      });

    const outcomes = await Promise.all([create(first), create(second)]);

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["barcode_taken", "created"]);
    const holders = await db.select().from(productBarcodes).where(eq(productBarcodes.code, code));
    expect(holders).toHaveLength(1);
    expect(await db.select().from(products)).toHaveLength(1);
    const rows = await Promise.all([first, second].map(({ rowId }) => storedListRow(db, rowId)));
    expect(rows.filter((row) => row?.productId !== null)).toHaveLength(1);
  });
});
