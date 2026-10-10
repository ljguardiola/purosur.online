import type { PriceReviewPostponement, SaleUnit } from "@purosur/domain";
import {
  type LockPackagingResult,
  type LockProductResult,
  type LockSupplierResult,
  type NewPackagingFields,
  type NewPurchaseFields,
  type NewPurchaseLineFields,
  type NewSupplierFields,
  type PackagingFields,
  PackagingNameConflict,
  type PurchasingStore,
  type PurchasingStoreTransaction,
  SupplierCuitConflict,
  type SupplierFields,
  SupplierNameConflict,
} from "@purosur/domain/purchasing/use-cases";
import { type PurchaseReceipt, receivePurchasedStock } from "@purosur/domain/stock/use-cases";
import { and, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import {
  branchSettings,
  priceReviewPostponements,
  productPackagings,
  products,
  purchaseLines,
  purchases,
  suppliers,
} from "../platform/db/schema.js";
import { DrizzleStockStoreTransaction } from "../stock/drizzle-stock-store.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

const UNIQUE_VIOLATION = "23505";
const SUPPLIER_NAME_UNIQUE_INDEX = "suppliers_name_lower_key";
const SUPPLIER_CUIT_UNIQUE_INDEX = "suppliers_cuit_key";
const PACKAGING_NAME_UNIQUE_INDEX = "product_packagings_product_id_name_lower_key";

function violatesUniqueIndex(error: unknown, index: string): boolean {
  return postgresErrorChain(error).some(
    (link) => link.code === UNIQUE_VIOLATION && link.constraint === index,
  );
}

function translateSupplierViolation(error: unknown): unknown {
  if (violatesUniqueIndex(error, SUPPLIER_NAME_UNIQUE_INDEX)) {
    return new SupplierNameConflict();
  }
  if (violatesUniqueIndex(error, SUPPLIER_CUIT_UNIQUE_INDEX)) {
    return new SupplierCuitConflict();
  }
  return error;
}

function translatePackagingViolation(error: unknown): unknown {
  return violatesUniqueIndex(error, PACKAGING_NAME_UNIQUE_INDEX)
    ? new PackagingNameConflict()
    : error;
}

class DrizzlePurchasingStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PurchasingStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  private readonly stock: DrizzleStockStoreTransaction<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date, pending: PendingChanges) {
    this.tx = tx;
    this.now = now;
    this.stock = new DrizzleStockStoreTransaction(tx, pending);
  }

  async lockSupplier(supplierId: string): Promise<LockSupplierResult> {
    const [supplier] = await this.tx
      .select({
        id: suppliers.id,
        name: suppliers.name,
        cuit: suppliers.cuit,
        contact: suppliers.contact,
        note: suppliers.note,
        active: suppliers.active,
        version: suppliers.version,
      })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .for("update");
    return supplier ? { kind: "locked", supplier } : { kind: "not_found" };
  }

  async supplierNameTaken(name: string, excludingSupplierId?: string): Promise<boolean> {
    const [row] = await this.tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(
        and(
          sql`lower(${suppliers.name}) = lower(${name})`,
          excludingSupplierId === undefined ? undefined : ne(suppliers.id, excludingSupplierId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async supplierCuitTaken(cuit: string, excludingSupplierId?: string): Promise<boolean> {
    const [row] = await this.tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.cuit, cuit),
          excludingSupplierId === undefined ? undefined : ne(suppliers.id, excludingSupplierId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async insertSupplier(fields: NewSupplierFields): Promise<{ id: string }> {
    try {
      const [supplier] = await this.tx
        .insert(suppliers)
        .values({ ...fields, updatedAt: this.now() })
        .returning({ id: suppliers.id });
      if (!supplier) {
        throw new Error("inserting the supplier returned no row");
      }
      return supplier;
    } catch (error) {
      throw translateSupplierViolation(error);
    }
  }

  async updateSupplier(supplierId: string, fields: SupplierFields): Promise<void> {
    try {
      await this.tx
        .update(suppliers)
        .set({ ...fields, updatedAt: this.now() })
        .where(eq(suppliers.id, supplierId));
    } catch (error) {
      throw translateSupplierViolation(error);
    }
  }

  async lockProduct(productId: string): Promise<LockProductResult> {
    const [product] = await this.tx
      .select({ id: products.id, saleUnit: products.saleUnit, active: products.active })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    return product
      ? { kind: "locked", product: { ...product, saleUnit: product.saleUnit as SaleUnit } }
      : { kind: "not_found" };
  }

  async holdPurchasedProduct(productId: string): Promise<LockProductResult> {
    const [product] = await this.tx
      .select({ id: products.id, saleUnit: products.saleUnit, active: products.active })
      .from(products)
      .where(eq(products.id, productId))
      .for("share");
    return product
      ? { kind: "locked", product: { ...product, saleUnit: product.saleUnit as SaleUnit } }
      : { kind: "not_found" };
  }

  async lockProductOfPackaging(packagingId: string): Promise<LockProductResult> {
    const [product] = await this.tx
      .select({ id: products.id, saleUnit: products.saleUnit, active: products.active })
      .from(products)
      .innerJoin(productPackagings, eq(productPackagings.productId, products.id))
      .where(eq(productPackagings.id, packagingId))
      .for("update", { of: products });
    return product
      ? { kind: "locked", product: { ...product, saleUnit: product.saleUnit as SaleUnit } }
      : { kind: "not_found" };
  }

  async lockPackaging(packagingId: string): Promise<LockPackagingResult> {
    const [packaging] = await this.tx
      .select({
        id: productPackagings.id,
        productId: productPackagings.productId,
        name: productPackagings.name,
        quantityPerPackage: productPackagings.quantityPerPackage,
        saleUnit: productPackagings.saleUnit,
        active: productPackagings.active,
        version: productPackagings.version,
      })
      .from(productPackagings)
      .where(eq(productPackagings.id, packagingId))
      .for("update");
    return packaging
      ? { kind: "locked", packaging: { ...packaging, saleUnit: packaging.saleUnit as SaleUnit } }
      : { kind: "not_found" };
  }

  async packagingNameTaken(
    productId: string,
    name: string,
    excludingPackagingId?: string,
  ): Promise<boolean> {
    const [row] = await this.tx
      .select({ id: productPackagings.id })
      .from(productPackagings)
      .where(
        and(
          eq(productPackagings.productId, productId),
          sql`lower(${productPackagings.name}) = lower(${name})`,
          excludingPackagingId === undefined
            ? undefined
            : ne(productPackagings.id, excludingPackagingId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async insertPackaging(fields: NewPackagingFields): Promise<{ id: string }> {
    try {
      const [packaging] = await this.tx
        .insert(productPackagings)
        .values({ ...fields, updatedAt: this.now() })
        .returning({ id: productPackagings.id });
      if (!packaging) {
        throw new Error("inserting the packaging returned no row");
      }
      return packaging;
    } catch (error) {
      throw translatePackagingViolation(error);
    }
  }

  async updatePackaging(packagingId: string, fields: PackagingFields): Promise<void> {
    try {
      await this.tx
        .update(productPackagings)
        .set({ ...fields, updatedAt: this.now() })
        .where(eq(productPackagings.id, packagingId));
    } catch (error) {
      throw translatePackagingViolation(error);
    }
  }

  async insertPurchase(fields: NewPurchaseFields): Promise<{ id: string }> {
    const [purchase] = await this.tx
      .insert(purchases)
      .values(fields)
      .returning({ id: purchases.id });
    if (!purchase) {
      throw new Error("inserting the purchase returned no row");
    }
    return purchase;
  }

  async insertPurchaseLine(fields: NewPurchaseLineFields): Promise<{ id: string }> {
    const [line] = await this.tx
      .insert(purchaseLines)
      .values(fields)
      .returning({ id: purchaseLines.id });
    if (!line) {
      throw new Error("inserting the purchase line returned no row");
    }
    return line;
  }

  async postponePriceReviews(postponement: PriceReviewPostponement): Promise<void> {
    const [settings] = await this.tx
      .select({ priceListId: branchSettings.priceListId })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, postponement.locationId));
    if (!settings) {
      throw new Error(`branch settings missing for location ${postponement.locationId}`);
    }
    await this.tx.insert(priceReviewPostponements).values(
      postponement.productIds.map((productId) => ({
        productId,
        priceListId: settings.priceListId,
        postponedAt: postponement.postponedAt,
        actorId: postponement.actorId,
        purchaseId: postponement.purchaseId,
      })),
    );
  }

  async receiveStock(receipt: PurchaseReceipt): Promise<void> {
    const outcome = await receivePurchasedStock(this.stock, receipt);
    if (outcome.kind === "not_found") {
      throw new Error(`the purchased product ${outcome.productId} vanished while it was held`);
    }
  }
}

export class DrizzlePurchasingStore<TQueryResult extends PgQueryResultHKT>
  implements PurchasingStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: PurchasingStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzlePurchasingStoreTransaction(tx, this.now, pending)),
    );
  }
}
