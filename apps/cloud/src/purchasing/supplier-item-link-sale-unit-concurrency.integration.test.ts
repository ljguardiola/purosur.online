import { randomUUID } from "node:crypto";
import { editProduct } from "@purosur/domain/catalog/use-cases";
import { linkSupplierPriceListRow } from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import { productBarcodes, products } from "../platform/db/schema.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleSupplierPriceListStore } from "./drizzle-supplier-price-list-store.js";
import { extractedListWithRow, storedListRow } from "./test-support/extracted-list-fixtures.js";
import { insertProduct } from "./test-support/purchasing-fixtures.js";

const now = () => new Date("2026-10-15T15:00:00Z");
const clock = { now };
const TWELVE_UNITS = 12_000;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("supplier_item_link_sale_unit_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function unitProduct() {
  const product = await insertProduct(db, { name: "Galletitas" });
  const barcode = randomUUID();
  await db
    .insert(productBarcodes)
    .values({ productId: product.id, code: barcode, position: 0, active: true });
  const [row] = await db
    .select({ categoryId: products.categoryId })
    .from(products)
    .where(eq(products.id, product.id));
  return { ...product, barcode, categoryId: row?.categoryId ?? "" };
}

function holdProductRowLock(id: string) {
  return (connection: postgres.ReservedSql) =>
    connection`select id from products where id = ${id} for update`;
}

function editToWeight(product: {
  id: string;
  version: number;
  categoryId: string;
  barcode: string;
}) {
  return () =>
    editProduct(
      { zoneRules: fixedZoneRulesSource(), store: new DrizzleCatalogStore(db), clock },
      {
        id: product.id,
        name: "Galletitas",
        categoryId: product.categoryId,
        brandId: null,
        saleUnit: "KG",
        barcodes: [product.barcode],
        netContent: null,
        tagIds: [],
        version: product.version,
      },
    );
}

function linkOf(target: { listId: string; rowId: string; actorId: string }, productId: string) {
  return () =>
    linkSupplierPriceListRow(new DrizzleSupplierPriceListStore(db, now), {
      listId: target.listId,
      rowId: target.rowId,
      version: 1,
      productId,
      saleUnit: "UNIT",
      quantity: TWELVE_UNITS,
      vatRate: 2_100,
      actorId: target.actorId,
    });
}

describe("selling a product by weight while a supplier item is linked to it, on a real Postgres", () => {
  it("refuses the link stated in units when the edit commits first", async () => {
    const product = await unitProduct();
    const target = await extractedListWithRow(db);

    const [edit, linking] = await runQueuedBehindHeldLock(
      sql,
      holdProductRowLock(product.id),
      editToWeight(product),
      linkOf(target, product.id),
    );

    expect(edit.kind).toBe("applied");
    expect(linking.kind).toBe("sale_unit_changed");
    expect(await storedListRow(db, target.rowId)).toMatchObject({ productId: null });
  });

  it("refuses the edit when the link commits first", async () => {
    const product = await unitProduct();
    const target = await extractedListWithRow(db);

    const [linking, edit] = await runQueuedBehindHeldLock(
      sql,
      holdProductRowLock(product.id),
      linkOf(target, product.id),
      editToWeight(product),
    );

    expect(linking.kind).toBe("linked");
    expect(edit.kind).toBe("sale_unit_held_by_supplier_item");
    const [stored] = await db.select().from(products).where(eq(products.id, product.id));
    expect(stored?.saleUnit).toBe("UNIT");
  });
});
