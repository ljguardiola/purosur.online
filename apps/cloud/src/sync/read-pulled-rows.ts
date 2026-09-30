import type { NetContentUnit, SaleUnit } from "@purosur/domain";
import { asc, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  categories,
  priceLists,
  prices,
  productBarcodes,
  products,
  productTags,
  tags,
} from "../platform/db/schema.js";
import { PRICE_VERSION } from "../pricing/price-version.js";
import type { CategoryRow, PriceListRow, PriceRow, ProductRow, TagRow } from "./pulled-changes.js";

export async function readCategories<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  ids: readonly string[],
): Promise<Map<string, CategoryRow>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await tx
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      version: categories.version,
    })
    .from(categories)
    .where(inArray(categories.id, [...ids]))
    .orderBy(asc(categories.id));
  return new Map(rows.map(({ id, ...row }) => [id, row]));
}

export async function readProducts<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  ids: readonly string[],
): Promise<Map<string, ProductRow>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await tx
    .select({
      id: products.id,
      name: products.name,
      categoryId: products.categoryId,
      brandId: products.brandId,
      saleUnit: products.saleUnit,
      active: products.active,
      netContentQuantity: products.netContentQuantity,
      netContentUnit: products.netContentUnit,
      version: products.version,
    })
    .from(products)
    .where(inArray(products.id, [...ids]))
    .orderBy(asc(products.id))
    .for("share");
  const barcodes = await tx
    .select({
      productId: productBarcodes.productId,
      position: productBarcodes.position,
      code: productBarcodes.code,
    })
    .from(productBarcodes)
    .where(
      inArray(
        productBarcodes.productId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(productBarcodes.position));
  const assignedTags = await tx
    .select({ productId: productTags.productId, tagId: productTags.tagId })
    .from(productTags)
    .where(
      inArray(
        productTags.productId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(productTags.tagId));
  const tagIdsByProduct = new Map<string, string[]>();
  for (const { productId, tagId } of assignedTags) {
    tagIdsByProduct.set(productId, [...(tagIdsByProduct.get(productId) ?? []), tagId]);
  }
  const barcodesByProduct = new Map<string, { position: number; code: string }[]>();
  for (const { productId, position, code } of barcodes) {
    barcodesByProduct.set(productId, [
      ...(barcodesByProduct.get(productId) ?? []),
      { position, code },
    ]);
  }
  return new Map(
    rows.map((row) => [
      row.id,
      {
        name: row.name,
        categoryId: row.categoryId,
        brandId: row.brandId,
        saleUnit: row.saleUnit as SaleUnit,
        active: row.active,
        netContent:
          row.netContentQuantity === null || row.netContentUnit === null
            ? null
            : { quantity: row.netContentQuantity, unit: row.netContentUnit as NetContentUnit },
        barcodes: barcodesByProduct.get(row.id) ?? [],
        tagIds: tagIdsByProduct.get(row.id) ?? [],
        version: row.version,
      },
    ]),
  );
}

export async function readTags<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  ids: readonly string[],
): Promise<Map<string, TagRow>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await tx
    .select({ id: tags.id, name: tags.name, active: tags.active, version: tags.version })
    .from(tags)
    .where(inArray(tags.id, [...ids]))
    .orderBy(asc(tags.id));
  return new Map(rows.map(({ id, ...row }) => [id, row]));
}

export async function readPriceLists<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  ids: readonly string[],
): Promise<Map<string, PriceListRow>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await tx
    .select({ id: priceLists.id, name: priceLists.name, version: priceLists.version })
    .from(priceLists)
    .where(inArray(priceLists.id, [...ids]))
    .orderBy(asc(priceLists.id));
  return new Map(rows.map(({ id, ...row }) => [id, row]));
}

export async function readPrices<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  ids: readonly string[],
): Promise<Map<string, PriceRow>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await tx
    .select({
      id: prices.id,
      productId: prices.productId,
      priceListId: prices.priceListId,
      unitPrice: prices.unitPrice,
      validFrom: prices.validFrom,
    })
    .from(prices)
    .where(inArray(prices.id, [...ids]))
    .orderBy(asc(prices.id));
  return new Map(rows.map(({ id, ...row }) => [id, { ...row, version: PRICE_VERSION }]));
}
