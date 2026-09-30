import type { SaleUnit } from "@purosur/domain";
import {
  type BrandFields,
  type BuyNPayMDiscount,
  CatalogBarcodeConflict,
  CatalogBrandNameConflict,
  CatalogCategoryNameConflict,
  type CatalogStore,
  type CatalogStoreTransaction,
  CatalogTagNameConflict,
  type CategoryFields,
  type LockBrandResult,
  type LockCategoryResult,
  type LockedProduct,
  type LockLeafCategoryResult,
  type LockParentForNewChildResult,
  type LockProductResult,
  type LockTagResult,
  type NewProductFields,
  type ProductFields,
  type TagFields,
} from "@purosur/domain/catalog/use-cases";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import {
  brands,
  categories,
  discounts,
  productBarcodes,
  products,
  productTags,
  tags,
} from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

const UNIQUE_VIOLATION = "23505";
const BARCODE_UNIQUE_INDEX = "product_barcodes_code_key";
const CATEGORY_NAME_UNIQUE_INDEX = "categories_name_lower_key";
const BRAND_NAME_UNIQUE_INDEX = "brands_name_lower_key";
const TAG_NAME_UNIQUE_INDEX = "tags_name_lower_key";

export const CATEGORY_MOVE_LOCK_KEY = "category-move";

function violatesUniqueIndex(error: unknown, index: string): boolean {
  return postgresErrorChain(error).some(
    (link) => link.code === UNIQUE_VIOLATION && link.constraint === index,
  );
}

async function activeBarcodesTaken<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  codes: readonly string[],
  excludingProductId: string | undefined,
): Promise<string[]> {
  const rows = await db
    .select({ code: productBarcodes.code })
    .from(productBarcodes)
    .where(
      and(
        inArray(productBarcodes.code, [...codes]),
        excludingProductId === undefined
          ? undefined
          : ne(productBarcodes.productId, excludingProductId),
        eq(productBarcodes.active, true),
      ),
    );
  return rows.map((row) => row.code);
}

class DrizzleCatalogStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements CatalogStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async lockLeafCategory(categoryId: string): Promise<LockLeafCategoryResult> {
    if (!UUID_PATTERN.test(categoryId)) {
      return { kind: "not_found" };
    }
    const [category] = await this.tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .for("update");
    if (!category) {
      return { kind: "not_found" };
    }
    const [childCategory] = await this.tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, categoryId))
      .limit(1);
    return childCategory ? { kind: "not_leaf" } : { kind: "locked", category };
  }

  // Any assigned product blocks, inactive ones included.
  async lockParentForNewChild(parentId: string): Promise<LockParentForNewChildResult> {
    if (!UUID_PATTERN.test(parentId)) {
      return { kind: "not_found" };
    }
    const [parent] = await this.tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, parentId))
      .for("update");
    if (!parent) {
      return { kind: "not_found" };
    }
    const [product] = await this.tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.categoryId, parentId))
      .limit(1);
    return product ? { kind: "has_products" } : { kind: "locked" };
  }

  async lockProduct(productId: string): Promise<LockProductResult> {
    if (!UUID_PATTERN.test(productId)) {
      return { kind: "not_found" };
    }
    const [product] = await this.tx
      .select({
        id: products.id,
        version: products.version,
        active: products.active,
        brandId: products.brandId,
        saleUnit: products.saleUnit,
      })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!product) {
      return { kind: "not_found" };
    }
    return {
      kind: "locked",
      product: {
        ...product,
        saleUnit: product.saleUnit as SaleUnit,
        tagIds: await this.tagIdsOf(productId),
      },
    };
  }

  async buyNPayMDiscountsOn(productId: string): Promise<BuyNPayMDiscount[]> {
    return this.tx
      .select({
        name: discounts.name,
        active: discounts.active,
        validFrom: discounts.validFrom,
        validTo: discounts.validTo,
      })
      .from(discounts)
      .where(and(eq(discounts.productId, productId), eq(discounts.kind, "BUY_N_PAY_M")));
  }

  async lockCategory(categoryId: string): Promise<LockCategoryResult> {
    if (!UUID_PATTERN.test(categoryId)) {
      return { kind: "not_found" };
    }
    const [category] = await this.tx
      .select({
        name: categories.name,
        version: categories.version,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .for("update");
    return category ? { kind: "locked", category } : { kind: "not_found" };
  }

  async lockCategoryTreeForMove(): Promise<void> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${CATEGORY_MOVE_LOCK_KEY}, 0))`,
    );
  }

  async parentIdOf(categoryId: string): Promise<string | null> {
    const [row] = await this.tx
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, categoryId));
    return row?.parentId ?? null;
  }

  async siblingNameTaken(
    parentId: string | null,
    name: string,
    excludingCategoryId?: string,
  ): Promise<boolean> {
    const [sibling] = await this.tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId),
          sql`lower(${categories.name}) = lower(${name})`,
          excludingCategoryId === undefined ? undefined : ne(categories.id, excludingCategoryId),
        ),
      )
      .limit(1);
    return sibling !== undefined;
  }

  activeBarcodesTaken(codes: readonly string[], excludingProductId?: string): Promise<string[]> {
    return activeBarcodesTaken(this.tx, codes, excludingProductId);
  }

  async insertProduct(fields: NewProductFields): Promise<{ id: string }> {
    const [product] = await this.tx
      .insert(products)
      .values({
        name: fields.name,
        categoryId: fields.categoryId,
        brandId: fields.brandId,
        saleUnit: fields.saleUnit,
        netContentQuantity: fields.netContent?.quantity,
        netContentUnit: fields.netContent?.unit,
      })
      .returning({ id: products.id, version: products.version });
    if (!product) {
      throw new Error("inserting the product returned no row");
    }
    this.pending.note({
      entity: "product",
      entityId: product.id,
      version: product.version,
      op: "insert",
    });
    return { id: product.id };
  }

  async insertProductBarcodes(productId: string, barcodes: readonly string[]): Promise<void> {
    await this.writeBarcodes(productId, barcodes, true);
  }

  async updateProduct(productId: string, fields: ProductFields): Promise<void> {
    await this.tx
      .update(products)
      .set({
        name: fields.name,
        categoryId: fields.categoryId,
        brandId: fields.brandId,
        saleUnit: fields.saleUnit,
        netContentQuantity: fields.netContent?.quantity ?? null,
        netContentUnit: fields.netContent?.unit ?? null,
        version: fields.version,
      })
      .where(eq(products.id, productId));
    this.pending.note({
      entity: "product",
      entityId: productId,
      version: fields.version,
      op: "update",
    });
  }

  async replaceProductBarcodes(product: LockedProduct, barcodes: readonly string[]): Promise<void> {
    // Each barcode row mirrors its product's `active` flag, which the partial unique index on active
    // codes relies on; writing them active would otherwise reactivate a deactivated product's codes.
    await this.tx.delete(productBarcodes).where(eq(productBarcodes.productId, product.id));
    await this.writeBarcodes(product.id, barcodes, product.active);
  }

  // A database trigger rejects any `DELETE` on `products` outright, so a product is never deleted,
  // only deactivated.
  async deactivateProduct(productId: string, nextVersion: number): Promise<void> {
    await this.tx
      .update(products)
      .set({ active: false, version: nextVersion })
      .where(eq(products.id, productId));
    this.pending.note({
      entity: "product",
      entityId: productId,
      version: nextVersion,
      op: "update",
    });
  }

  async deactivateProductBarcodes(productId: string): Promise<void> {
    await this.tx
      .update(productBarcodes)
      .set({ active: false })
      .where(eq(productBarcodes.productId, productId));
  }

  async insertCategory(name: string, parentId: string | null): Promise<{ id: string }> {
    try {
      const [category] = await this.tx
        .insert(categories)
        .values({ name, parentId })
        .returning({ id: categories.id, version: categories.version });
      if (!category) {
        throw new Error("inserting the category returned no row");
      }
      this.pending.note({
        entity: "category",
        entityId: category.id,
        version: category.version,
        op: "insert",
      });
      return { id: category.id };
    } catch (error) {
      throw translateCategoryNameViolation(error);
    }
  }

  async updateCategory(categoryId: string, fields: CategoryFields): Promise<void> {
    try {
      await this.tx
        .update(categories)
        .set({ name: fields.name, parentId: fields.parentId, version: fields.version })
        .where(eq(categories.id, categoryId));
      this.pending.note({
        entity: "category",
        entityId: categoryId,
        version: fields.version,
        op: "update",
      });
    } catch (error) {
      throw translateCategoryNameViolation(error);
    }
  }

  async insertProductTags(productId: string, tagIds: readonly string[]): Promise<void> {
    if (tagIds.length === 0) {
      return;
    }
    await this.tx.insert(productTags).values(tagIds.map((tagId) => ({ productId, tagId })));
  }

  async replaceProductTags(productId: string, tagIds: readonly string[]): Promise<void> {
    await this.tx.delete(productTags).where(eq(productTags.productId, productId));
    await this.insertProductTags(productId, tagIds);
  }

  async lockTag(tagId: string): Promise<LockTagResult> {
    if (!UUID_PATTERN.test(tagId)) {
      return { kind: "not_found" };
    }
    const [tag] = await this.tx
      .select({ name: tags.name, active: tags.active, version: tags.version })
      .from(tags)
      .where(eq(tags.id, tagId))
      .for("update");
    return tag ? { kind: "locked", tag } : { kind: "not_found" };
  }

  async tagNameTaken(name: string, excludingTagId?: string): Promise<boolean> {
    const [tag] = await this.tx
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          sql`lower(${tags.name}) = lower(${name})`,
          excludingTagId === undefined ? undefined : ne(tags.id, excludingTagId),
        ),
      )
      .limit(1);
    return tag !== undefined;
  }

  async insertTag(name: string): Promise<{ id: string }> {
    try {
      const [tag] = await this.tx
        .insert(tags)
        .values({ name })
        .returning({ id: tags.id, version: tags.version });
      if (!tag) {
        throw new Error("inserting the tag returned no row");
      }
      this.pending.note({ entity: "tag", entityId: tag.id, version: tag.version, op: "insert" });
      return { id: tag.id };
    } catch (error) {
      throw translateTagNameViolation(error);
    }
  }

  async updateTag(tagId: string, fields: TagFields): Promise<void> {
    try {
      await this.tx
        .update(tags)
        .set({ name: fields.name, active: fields.active, version: fields.version })
        .where(eq(tags.id, tagId));
      this.pending.note({ entity: "tag", entityId: tagId, version: fields.version, op: "update" });
    } catch (error) {
      throw translateTagNameViolation(error);
    }
  }

  async lockBrand(brandId: string): Promise<LockBrandResult> {
    if (!UUID_PATTERN.test(brandId)) {
      return { kind: "not_found" };
    }
    const [brand] = await this.tx
      .select({ name: brands.name, active: brands.active, version: brands.version })
      .from(brands)
      .where(eq(brands.id, brandId))
      .for("update");
    return brand ? { kind: "locked", brand } : { kind: "not_found" };
  }

  async brandNameTaken(name: string, excludingBrandId?: string): Promise<boolean> {
    const [brand] = await this.tx
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          sql`lower(${brands.name}) = lower(${name})`,
          excludingBrandId === undefined ? undefined : ne(brands.id, excludingBrandId),
        ),
      )
      .limit(1);
    return brand !== undefined;
  }

  async insertBrand(name: string): Promise<{ id: string }> {
    try {
      const [brand] = await this.tx.insert(brands).values({ name }).returning({ id: brands.id });
      if (!brand) {
        throw new Error("inserting the brand returned no row");
      }
      return brand;
    } catch (error) {
      throw translateBrandNameViolation(error);
    }
  }

  async updateBrand(brandId: string, fields: BrandFields): Promise<void> {
    try {
      await this.tx
        .update(brands)
        .set({ name: fields.name, active: fields.active, version: fields.version })
        .where(eq(brands.id, brandId));
    } catch (error) {
      throw translateBrandNameViolation(error);
    }
  }

  private async tagIdsOf(productId: string): Promise<string[]> {
    const rows = await this.tx
      .select({ tagId: productTags.tagId })
      .from(productTags)
      .innerJoin(tags, eq(tags.id, productTags.tagId))
      .where(eq(productTags.productId, productId))
      .orderBy(asc(tags.name));
    return rows.map((row) => row.tagId);
  }

  private async writeBarcodes(
    productId: string,
    barcodes: readonly string[],
    active: boolean,
  ): Promise<void> {
    try {
      await this.tx
        .insert(productBarcodes)
        .values(barcodes.map((code, position) => ({ productId, code, position, active })));
    } catch (error) {
      if (violatesUniqueIndex(error, BARCODE_UNIQUE_INDEX)) {
        throw new CatalogBarcodeConflict();
      }
      throw error;
    }
  }
}

function translateCategoryNameViolation(error: unknown): unknown {
  return violatesUniqueIndex(error, CATEGORY_NAME_UNIQUE_INDEX)
    ? new CatalogCategoryNameConflict()
    : error;
}

function translateBrandNameViolation(error: unknown): unknown {
  return violatesUniqueIndex(error, BRAND_NAME_UNIQUE_INDEX)
    ? new CatalogBrandNameConflict()
    : error;
}

function translateTagNameViolation(error: unknown): unknown {
  return violatesUniqueIndex(error, TAG_NAME_UNIQUE_INDEX) ? new CatalogTagNameConflict() : error;
}

export class DrizzleCatalogStore<TQueryResult extends PgQueryResultHKT> implements CatalogStore {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, pending?: PendingChanges) {
    this.db = db;
    this.pending = pending;
  }

  transaction<TOutcome>(
    work: (tx: CatalogStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzleCatalogStoreTransaction(tx, pending)),
    );
  }

  activeBarcodesTaken(codes: readonly string[], excludingProductId?: string): Promise<string[]> {
    return activeBarcodesTaken(this.db, codes, excludingProductId);
  }
}
