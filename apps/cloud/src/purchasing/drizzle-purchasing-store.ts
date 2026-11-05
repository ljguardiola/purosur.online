import type { PriceReviewPostponement, SaleUnit } from "@purosur/domain";
import {
  type LockedPurchaseLine,
  type LockProductResult,
  type LockPurchaseResult,
  type LockSupplierResult,
  type LotCostCorrection,
  type LotExpiryCorrection,
  type LotExpirySplit,
  type LotExpirySplitResult,
  type LotQuantityCorrection,
  type LotQuantityCorrectionResult,
  type NewPurchaseFields,
  type NewPurchaseLineFields,
  type NewSupplierFields,
  type PurchaseCorrection,
  type PurchaseCorrectionStore,
  type PurchaseCorrectionStoreTransaction,
  type PurchasedLotsRedating,
  type PurchaseHeaderValues,
  type PurchasingStore,
  type PurchasingStoreTransaction,
  SupplierCuitConflict,
  type SupplierFields,
  SupplierNameConflict,
} from "@purosur/domain/purchasing/use-cases";
import {
  correctLotExpiry,
  correctPurchasedLotCost,
  correctPurchasedLotQuantity,
  type PurchaseReceipt,
  receivePurchasedStock,
  redatePurchasedLots,
  splitPurchasedLot,
} from "@purosur/domain/stock/use-cases";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { auditLog, products, purchaseLines, purchases, suppliers } from "../platform/db/schema.js";
import { DrizzlePricingStoreTransaction } from "../pricing/drizzle-pricing-store.js";
import { DrizzleStockStoreTransaction } from "../stock/drizzle-stock-store.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

import { auditValuesOf, PURCHASE_AUDIT_ENTITY } from "./purchase-audit-values.js";

const UNIQUE_VIOLATION = "23505";
const SUPPLIER_NAME_UNIQUE_INDEX = "suppliers_name_lower_key";
const SUPPLIER_CUIT_UNIQUE_INDEX = "suppliers_cuit_key";

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

export class DrizzlePurchasingStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PurchasingStoreTransaction, PurchaseCorrectionStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  private readonly stock: DrizzleStockStoreTransaction<TQueryResult>;
  private readonly pricing: DrizzlePricingStoreTransaction<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date, pending: PendingChanges) {
    this.tx = tx;
    this.now = now;
    this.stock = new DrizzleStockStoreTransaction(tx, pending);
    this.pricing = new DrizzlePricingStoreTransaction(tx, now, pending);
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

  postponePriceReviews(postponement: PriceReviewPostponement): Promise<void> {
    return this.pricing.postponePriceReviews(postponement);
  }

  async receiveStock(receipt: PurchaseReceipt): Promise<void> {
    const outcome = await receivePurchasedStock(this.stock, receipt);
    if (outcome.kind === "not_found") {
      throw new Error(`the purchased product ${outcome.productId} vanished while it was held`);
    }
  }

  async lockPurchase(locationId: string, purchaseId: string): Promise<LockPurchaseResult> {
    const [purchase] = await this.tx
      .select({
        id: purchases.id,
        purchasedOn: purchases.purchasedOn,
        receiptType: purchases.receiptType,
        receiptNumber: purchases.receiptNumber,
        note: purchases.note,
      })
      .from(purchases)
      .where(and(eq(purchases.id, purchaseId), eq(purchases.locationId, locationId)))
      .for("update");
    if (!purchase) {
      return { kind: "not_found" };
    }
    const [last] = await this.tx
      .select({ position: purchaseLines.position })
      .from(purchaseLines)
      .where(eq(purchaseLines.purchaseId, purchaseId))
      .orderBy(desc(purchaseLines.position))
      .limit(1);
    return {
      kind: "locked",
      purchase: {
        ...purchase,
        receiptType: purchase.receiptType as PurchaseHeaderValues["receiptType"],
        lastLinePosition: last?.position ?? 0,
      },
    };
  }

  async purchaseLine(purchaseId: string, lineId: string): Promise<LockedPurchaseLine | undefined> {
    const [line] = await this.tx
      .select({
        id: purchaseLines.id,
        expiresOn: purchaseLines.expiresOn,
        costPaidCents: purchaseLines.costPaidCents,
        quantity: purchaseLines.quantity,
        packages: purchaseLines.packages,
        quantityPerPackage: purchaseLines.quantityPerPackage,
      })
      .from(purchaseLines)
      .where(and(eq(purchaseLines.id, lineId), eq(purchaseLines.purchaseId, purchaseId)));
    return line;
  }

  async purchaseLineIds(purchaseId: string): Promise<string[]> {
    const lines = await this.tx
      .select({ id: purchaseLines.id })
      .from(purchaseLines)
      .where(eq(purchaseLines.purchaseId, purchaseId))
      .orderBy(asc(purchaseLines.position));
    return lines.map(({ id }) => id);
  }

  async updatePurchaseHeader(purchaseId: string, values: PurchaseHeaderValues): Promise<void> {
    await this.tx.update(purchases).set(values).where(eq(purchases.id, purchaseId));
  }

  async updatePurchaseLineExpiry(lineId: string, expiresOn: string | null): Promise<void> {
    await this.tx.update(purchaseLines).set({ expiresOn }).where(eq(purchaseLines.id, lineId));
  }

  async updatePurchaseLineCost(lineId: string, costPaidCents: number): Promise<void> {
    await this.tx.update(purchaseLines).set({ costPaidCents }).where(eq(purchaseLines.id, lineId));
  }

  async updatePurchaseLineQuantity(
    lineId: string,
    quantity: number,
    packages: number | null,
  ): Promise<void> {
    await this.tx
      .update(purchaseLines)
      .set({ quantity, packages })
      .where(eq(purchaseLines.id, lineId));
  }

  async correctLotQuantity(
    correction: LotQuantityCorrection,
  ): Promise<LotQuantityCorrectionResult> {
    const outcome = await correctPurchasedLotQuantity(this.stock, correction);
    if (outcome.kind === "not_found") {
      throw new Error(`the lot of purchase line ${correction.purchaseLineId} vanished`);
    }
    return outcome;
  }

  async correctLotCost({
    locationId,
    purchaseLineId,
    costPaidCents,
    changedAt,
  }: LotCostCorrection): Promise<void> {
    const outcome = await correctPurchasedLotCost(this.stock, {
      locationId,
      purchaseLineId,
      totalCents: costPaidCents,
      changedAt,
    });
    if (outcome.kind === "not_found") {
      throw new Error(`the lot of purchase line ${purchaseLineId} vanished`);
    }
  }

  async correctLotExpiry(correction: LotExpiryCorrection): Promise<void> {
    const outcome = await correctLotExpiry(this.stock, correction);
    if (outcome.kind === "not_found") {
      throw new Error(`the lot of purchase line ${correction.purchaseLineId} vanished`);
    }
  }

  async splitLotExpiry(split: LotExpirySplit): Promise<LotExpirySplitResult> {
    const outcome = await splitPurchasedLot(this.stock, split);
    if (outcome.kind === "not_found") {
      throw new Error(`the lot of purchase line ${split.purchaseLineId} vanished`);
    }
    return outcome;
  }

  async redatePurchasedLots(redating: PurchasedLotsRedating): Promise<void> {
    const outcome = await redatePurchasedLots(this.stock, redating);
    if (outcome.kind === "not_found") {
      throw new Error("a lot of the purchase's lines vanished while it was locked");
    }
  }

  async recordPurchaseCorrection({
    purchaseId,
    actorId,
    correctedAt,
    change,
  }: PurchaseCorrection): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: PURCHASE_AUDIT_ENTITY,
      entityId: purchaseId,
      actorId,
      at: correctedAt,
      ...auditValuesOf(change),
    });
  }
}

export class DrizzlePurchasingStore<TQueryResult extends PgQueryResultHKT>
  implements PurchasingStore, PurchaseCorrectionStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (
      tx: PurchasingStoreTransaction & PurchaseCorrectionStoreTransaction,
    ) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzlePurchasingStoreTransaction(tx, this.now, pending)),
    );
  }
}
