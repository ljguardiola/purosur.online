import { randomUUID } from "node:crypto";
import { eq, sql as rawSql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, productPackagings, products, supplierItems } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { extractedListWithRow, storedListRow } from "./test-support/extracted-list-fixtures.js";

let integrationDb: IntegrationDatabase;
let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("old_release_supplier_link_writes");
  client = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(client);
}, 60_000);

afterAll(async () => {
  await client.end({ timeout: 1 });
  await integrationDb.close();
});

async function productWithPackaging(
  packaging: { quantity: number; saleUnit: "UNIT" | "KG"; active: boolean },
  actorId: string,
) {
  const [category] = await db
    .insert(categories)
    .values({ name: `Almacén ${randomUUID()}` })
    .returning({ id: categories.id });
  const [product] = await db
    .insert(products)
    .values({ name: `Yerba ${randomUUID()}`, categoryId: category?.id ?? "", saleUnit: "UNIT" })
    .returning({ id: products.id });
  const [row] = await db
    .insert(productPackagings)
    .values({
      productId: product?.id ?? "",
      name: "Caja",
      quantityPerPackage: packaging.quantity,
      saleUnit: packaging.saleUnit,
      active: packaging.active,
      actorId,
    })
    .returning({ id: productPackagings.id });
  return { productId: product?.id ?? "", packagingId: row?.id ?? "" };
}

describe("the writes of the release that links through packagings, on a real Postgres", () => {
  it("fills the quantity of a row linked with only a product and a packaging", async () => {
    const { rowId, actorId } = await extractedListWithRow(db, {}, { description: "Yerba A" });
    const { productId, packagingId } = await productWithPackaging(
      { quantity: 12_000, saleUnit: "UNIT", active: true },
      actorId,
    );

    await db.execute(
      rawSql`update supplier_price_list_rows set product_id = ${productId}, packaging_id = ${packagingId}, vat_rate = 2100 where id = ${rowId}`,
    );

    const row = await storedListRow(db, rowId);
    expect(row).toMatchObject({ quantity: 12_000, saleUnit: "UNIT", relinkRequired: false });
  });

  it("marks as requiring a new link the row linked to a deactivated packaging", async () => {
    const { rowId, actorId } = await extractedListWithRow(db, {}, { description: "Yerba B" });
    const { productId, packagingId } = await productWithPackaging(
      { quantity: 6_000, saleUnit: "KG", active: false },
      actorId,
    );

    await db.execute(
      rawSql`update supplier_price_list_rows set product_id = ${productId}, packaging_id = ${packagingId}, vat_rate = 2100 where id = ${rowId}`,
    );

    const row = await storedListRow(db, rowId);
    expect(row).toMatchObject({ quantity: 6_000, saleUnit: "KG", relinkRequired: true });
  });

  it("takes the quantity of the packaging a relink moves a row to, and clears it with the link", async () => {
    const { rowId, actorId } = await extractedListWithRow(db, {}, { description: "Yerba C" });
    const first = await productWithPackaging(
      { quantity: 1_000, saleUnit: "UNIT", active: true },
      actorId,
    );
    const second = await productWithPackaging(
      { quantity: 24_000, saleUnit: "UNIT", active: true },
      actorId,
    );
    await db.execute(
      rawSql`update supplier_price_list_rows set product_id = ${first.productId}, packaging_id = ${first.packagingId}, vat_rate = 2100 where id = ${rowId}`,
    );

    await db.execute(
      rawSql`update supplier_price_list_rows set product_id = ${second.productId}, packaging_id = ${second.packagingId} where id = ${rowId}`,
    );
    const relinked = await storedListRow(db, rowId);
    await db.execute(
      rawSql`update supplier_price_list_rows set product_id = null, packaging_id = null, vat_rate = null where id = ${rowId}`,
    );
    const cleared = await storedListRow(db, rowId);

    expect(relinked).toMatchObject({ quantity: 24_000, saleUnit: "UNIT" });
    expect(cleared).toMatchObject({
      productId: null,
      quantity: null,
      saleUnit: null,
      relinkRequired: false,
    });
  });

  it("fills the quantity of a supplier item inserted and updated with only a product and a packaging", async () => {
    const { supplierId, actorId } = await extractedListWithRow(db, {}, { description: "Yerba D" });
    const first = await productWithPackaging(
      { quantity: 3_000, saleUnit: "UNIT", active: true },
      actorId,
    );
    const second = await productWithPackaging(
      { quantity: 9_000, saleUnit: "UNIT", active: false },
      actorId,
    );
    const key = randomUUID();

    await db.execute(
      rawSql`insert into supplier_items (supplier_id, key_kind, key_value, description, product_id, packaging_id, vat_rate)
             values (${supplierId}, 'code', ${key}, 'Yerba D', ${first.productId}, ${first.packagingId}, 2100)`,
    );
    const [inserted] = await db.select().from(supplierItems).where(eq(supplierItems.keyValue, key));
    await db.execute(
      rawSql`update supplier_items set product_id = ${second.productId}, packaging_id = ${second.packagingId} where key_value = ${key}`,
    );
    const [updated] = await db.select().from(supplierItems).where(eq(supplierItems.keyValue, key));

    expect(inserted).toMatchObject({ quantity: 3_000, saleUnit: "UNIT", relinkRequired: false });
    expect(updated).toMatchObject({ quantity: 9_000, saleUnit: "UNIT", relinkRequired: true });
  });

  it("leaves alone a link written with a quantity and no packaging", async () => {
    const { rowId, actorId } = await extractedListWithRow(db, {}, { description: "Yerba E" });
    const { productId } = await productWithPackaging(
      { quantity: 1_000, saleUnit: "UNIT", active: true },
      actorId,
    );

    await db.execute(
      rawSql`update supplier_price_list_rows set product_id = ${productId}, quantity = 500, sale_unit = 'KG', vat_rate = 2100 where id = ${rowId}`,
    );

    const row = await storedListRow(db, rowId);
    expect(row).toMatchObject({
      packagingId: null,
      quantity: 500,
      saleUnit: "KG",
      relinkRequired: false,
    });
  });
});
