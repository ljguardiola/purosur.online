import type { SaleUnit } from "@purosur/domain";
import type {
  CatalogBrandSummary,
  CatalogCategory,
  CatalogListReader,
  CatalogProduct,
  CatalogTagSummary,
  ProductActivityScope,
} from "@purosur/domain/catalog/use-cases";
import { and, asc, count, countDistinct, eq, inArray, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  brands,
  categories,
  productBarcodes,
  products,
  productTags,
  tags,
} from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { netContentRow } from "./net-content-row.js";

function productActivityCondition(scope: ProductActivityScope) {
  switch (scope) {
    case "active":
      return eq(products.active, true);
    case "inactive":
      return eq(products.active, false);
    case "any":
      return undefined;
  }
}

function groupByProductId(rows: { productId: string; value: string }[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const existing = grouped.get(row.productId);
    if (existing) {
      existing.push(row.value);
    } else {
      grouped.set(row.productId, [row.value]);
    }
  }
  return grouped;
}

export class DrizzleCatalogListReader<TQueryResult extends PgQueryResultHKT>
  implements CatalogListReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  products(scope: ProductActivityScope): Promise<CatalogProduct[]> {
    return this.selectProducts(productActivityCondition(scope));
  }

  async product(productId: string): Promise<CatalogProduct | undefined> {
    if (!UUID_PATTERN.test(productId)) {
      return undefined;
    }
    const [product] = await this.selectProducts(eq(products.id, productId));
    return product;
  }

  private async selectProducts(condition: SQL | undefined): Promise<CatalogProduct[]> {
    const rows = await this.db
      .select({
        id: products.id,
        name: products.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
        brandId: products.brandId,
        saleUnit: products.saleUnit,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        active: products.active,
        version: products.version,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(condition)
      .orderBy(asc(products.name));

    const productIds = rows.map((row) => row.id);
    const barcodes = await this.barcodesByProductId(productIds);
    const tagIds = await this.tagIdsByProductId(productIds);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      brandId: row.brandId,
      saleUnit: row.saleUnit as SaleUnit,
      barcodes: barcodes.get(row.id) ?? [],
      tagIds: tagIds.get(row.id) ?? [],
      netContent: netContentRow(row),
      active: row.active,
      version: row.version,
    }));
  }

  categories(): Promise<CatalogCategory[]> {
    return this.db
      .select({
        id: categories.id,
        name: categories.name,
        version: categories.version,
        parentId: categories.parentId,
      })
      .from(categories)
      .orderBy(asc(categories.name));
  }

  async category(categoryId: string): Promise<CatalogCategory | undefined> {
    if (!UUID_PATTERN.test(categoryId)) {
      return undefined;
    }
    const [row] = await this.db
      .select({
        id: categories.id,
        name: categories.name,
        version: categories.version,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);
    return row;
  }

  brands(countedProducts: ProductActivityScope): Promise<CatalogBrandSummary[]> {
    return this.selectBrandSummaries(countedProducts).orderBy(asc(brands.name));
  }

  async brand(
    brandId: string,
    countedProducts: ProductActivityScope,
  ): Promise<CatalogBrandSummary | undefined> {
    if (!UUID_PATTERN.test(brandId)) {
      return undefined;
    }
    const [row] = await this.selectBrandSummaries(countedProducts)
      .where(eq(brands.id, brandId))
      .limit(1);
    return row;
  }

  tags(countedProducts: ProductActivityScope): Promise<CatalogTagSummary[]> {
    return this.selectTagSummaries(countedProducts).orderBy(asc(tags.name));
  }

  async tag(
    tagId: string,
    countedProducts: ProductActivityScope,
  ): Promise<CatalogTagSummary | undefined> {
    if (!UUID_PATTERN.test(tagId)) {
      return undefined;
    }
    const [row] = await this.selectTagSummaries(countedProducts).where(eq(tags.id, tagId)).limit(1);
    return row;
  }

  async taggedProductCount(countedProducts: ProductActivityScope): Promise<number> {
    const [row] = await this.db
      .select({ taggedProductCount: countDistinct(products.id) })
      .from(productTags)
      .innerJoin(
        products,
        and(eq(products.id, productTags.productId), productActivityCondition(countedProducts)),
      );
    return row?.taggedProductCount ?? 0;
  }

  private selectBrandSummaries(countedProducts: ProductActivityScope) {
    return this.db
      .select({
        id: brands.id,
        name: brands.name,
        active: brands.active,
        version: brands.version,
        productCount: count(products.id),
      })
      .from(brands)
      .leftJoin(
        products,
        and(eq(products.brandId, brands.id), productActivityCondition(countedProducts)),
      )
      .groupBy(brands.id);
  }

  private selectTagSummaries(countedProducts: ProductActivityScope) {
    return this.db
      .select({
        id: tags.id,
        name: tags.name,
        active: tags.active,
        version: tags.version,
        productCount: count(products.id),
      })
      .from(tags)
      .leftJoin(productTags, eq(productTags.tagId, tags.id))
      .leftJoin(
        products,
        and(eq(products.id, productTags.productId), productActivityCondition(countedProducts)),
      )
      .groupBy(tags.id);
  }

  private async barcodesByProductId(productIds: string[]): Promise<Map<string, string[]>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({ productId: productBarcodes.productId, value: productBarcodes.code })
      .from(productBarcodes)
      .where(inArray(productBarcodes.productId, productIds))
      .orderBy(asc(productBarcodes.position));
    return groupByProductId(rows);
  }

  private async tagIdsByProductId(productIds: string[]): Promise<Map<string, string[]>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({ productId: productTags.productId, value: productTags.tagId })
      .from(productTags)
      .innerJoin(tags, eq(tags.id, productTags.tagId))
      .where(inArray(productTags.productId, productIds))
      .orderBy(asc(tags.name));
    return groupByProductId(rows);
  }
}
