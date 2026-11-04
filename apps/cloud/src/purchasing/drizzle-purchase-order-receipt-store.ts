import type { PriceReviewPostponement } from "@purosur/domain";
import type {
  LockProductResult,
  LockReceivablePurchaseOrderResult,
  LockSupplierResult,
  NewPurchaseFields,
  NewPurchaseLineFields,
  NewPurchaseOrderReceiptFields,
  PurchaseOrderReceiptStore,
  PurchaseOrderReceiptStoreTransaction,
  PurchaseOrderReceiving,
  SupplierProductOffer,
} from "@purosur/domain/purchasing/use-cases";
import type { PurchaseReceipt } from "@purosur/domain/stock/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  purchaseOrderReceiptLines,
  purchaseOrderReceipts,
  purchaseOrders,
} from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import { DrizzlePurchaseOrderStoreTransaction } from "./drizzle-purchase-order-store.js";
import { DrizzlePurchasingStoreTransaction } from "./drizzle-purchasing-store.js";

class DrizzlePurchaseOrderReceiptStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PurchaseOrderReceiptStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly purchasing: DrizzlePurchasingStoreTransaction<TQueryResult>;
  private readonly orders: DrizzlePurchaseOrderStoreTransaction<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date, pending: PendingChanges) {
    this.tx = tx;
    this.purchasing = new DrizzlePurchasingStoreTransaction(tx, now, pending);
    this.orders = new DrizzlePurchaseOrderStoreTransaction(tx);
  }

  lockSupplier(supplierId: string): Promise<LockSupplierResult> {
    return this.purchasing.lockSupplier(supplierId);
  }

  holdPurchasedProduct(productId: string): Promise<LockProductResult> {
    return this.purchasing.holdPurchasedProduct(productId);
  }

  insertPurchase(fields: NewPurchaseFields): Promise<{ id: string }> {
    return this.purchasing.insertPurchase(fields);
  }

  insertPurchaseLine(fields: NewPurchaseLineFields): Promise<{ id: string }> {
    return this.purchasing.insertPurchaseLine(fields);
  }

  postponePriceReviews(postponement: PriceReviewPostponement): Promise<void> {
    return this.purchasing.postponePriceReviews(postponement);
  }

  receiveStock(receipt: PurchaseReceipt): Promise<void> {
    return this.purchasing.receiveStock(receipt);
  }

  supplierOffers(supplierId: string, productId: string): Promise<SupplierProductOffer[]> {
    return this.orders.supplierOffers(supplierId, productId);
  }

  lockPurchaseOrder(
    locationId: string,
    orderId: string,
  ): Promise<LockReceivablePurchaseOrderResult> {
    return this.orders.lockReceivablePurchaseOrder(locationId, orderId);
  }

  async receivedQuantities(orderId: string): Promise<Map<string, number>> {
    const rows = await this.tx
      .select({
        purchaseOrderLineId: purchaseOrderReceiptLines.purchaseOrderLineId,
        receivedQuantity: sql<string>`sum(${purchaseOrderReceiptLines.receivedQuantity})`,
      })
      .from(purchaseOrderReceiptLines)
      .innerJoin(
        purchaseOrderReceipts,
        eq(purchaseOrderReceipts.id, purchaseOrderReceiptLines.purchaseOrderReceiptId),
      )
      .where(eq(purchaseOrderReceipts.purchaseOrderId, orderId))
      .groupBy(purchaseOrderReceiptLines.purchaseOrderLineId);
    return new Map(rows.map((row) => [row.purchaseOrderLineId, Number(row.receivedQuantity)]));
  }

  async insertPurchaseOrderReceipt({
    lines,
    ...receipt
  }: NewPurchaseOrderReceiptFields): Promise<void> {
    const [inserted] = await this.tx
      .insert(purchaseOrderReceipts)
      .values(receipt)
      .returning({ id: purchaseOrderReceipts.id });
    if (!inserted) {
      throw new Error("inserting the purchase order receipt returned no row");
    }
    if (lines.length === 0) {
      return;
    }
    await this.tx
      .insert(purchaseOrderReceiptLines)
      .values(lines.map((line) => ({ ...line, purchaseOrderReceiptId: inserted.id })));
  }

  async markPurchaseOrderReceived(
    orderId: string,
    { state, receivedAt }: PurchaseOrderReceiving,
  ): Promise<void> {
    await this.tx
      .update(purchaseOrders)
      .set({ state, receivedAt })
      .where(eq(purchaseOrders.id, orderId));
  }
}

export class DrizzlePurchaseOrderReceiptStore<TQueryResult extends PgQueryResultHKT>
  implements PurchaseOrderReceiptStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: PurchaseOrderReceiptStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzlePurchaseOrderReceiptStoreTransaction(tx, this.now, pending)),
    );
  }
}
