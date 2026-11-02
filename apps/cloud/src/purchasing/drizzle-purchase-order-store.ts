import type { SaleUnit } from "@purosur/domain";
import type {
  LockedPurchaseOrder,
  LockProductResult,
  LockPurchaseOrderResult,
  LockSupplierResult,
  NewPurchaseOrderFields,
  NewPurchaseOrderLineFields,
  PurchaseOrderLineFields,
  PurchaseOrderStore,
  PurchaseOrderStoreTransaction,
  SupplierProductOffer,
} from "@purosur/domain/purchasing/use-cases";
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products, purchaseOrderLines, purchaseOrders, suppliers } from "../platform/db/schema.js";
import { latestSupplierOffers } from "./latest-supplier-offers.js";

class DrizzlePurchaseOrderStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PurchaseOrderStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
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
      .for("share");
    return supplier ? { kind: "locked", supplier } : { kind: "not_found" };
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

  async supplierOffers(supplierId: string, productId: string): Promise<SupplierProductOffer[]> {
    const offers = await latestSupplierOffers(this.tx, [productId]);
    return offers
      .filter((offer) => offer.supplier.id === supplierId)
      .map(({ link, priceCents, pricesIncludeVat, vatRate }) => ({
        link,
        priceCents,
        pricesIncludeVat,
        vatRate,
      }));
  }

  async insertDraftPurchaseOrder(fields: NewPurchaseOrderFields): Promise<{ id: string }> {
    const [order] = await this.tx
      .insert(purchaseOrders)
      .values({ ...fields, state: "DRAFT" })
      .returning({ id: purchaseOrders.id });
    if (!order) {
      throw new Error("inserting the purchase order returned no row");
    }
    return order;
  }

  async insertPurchaseOrderLine(fields: NewPurchaseOrderLineFields): Promise<void> {
    await this.tx.insert(purchaseOrderLines).values(fields);
  }

  async lockPurchaseOrder(locationId: string, orderId: string): Promise<LockPurchaseOrderResult> {
    const [order] = await this.tx
      .select({
        id: purchaseOrders.id,
        supplierId: purchaseOrders.supplierId,
        state: purchaseOrders.state,
      })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, orderId), eq(purchaseOrders.locationId, locationId)))
      .for("update");
    if (!order) {
      return { kind: "not_found" };
    }
    const lines = await this.tx
      .select({
        productId: purchaseOrderLines.productId,
        packages: purchaseOrderLines.packages,
        quantityPerPackage: purchaseOrderLines.quantityPerPackage,
        expectedPackagePriceCents: purchaseOrderLines.expectedPackagePriceCents,
      })
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, orderId))
      .orderBy(asc(purchaseOrderLines.position));
    return {
      kind: "locked",
      order: { ...order, state: order.state as LockedPurchaseOrder["state"], lines },
    };
  }

  async replacePurchaseOrderLines(
    orderId: string,
    lines: readonly PurchaseOrderLineFields[],
  ): Promise<void> {
    await this.tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, orderId));
    if (lines.length === 0) {
      return;
    }
    await this.tx.insert(purchaseOrderLines).values(
      lines.map((line, index) => ({
        ...line,
        purchaseOrderId: orderId,
        position: index + 1,
      })),
    );
  }

  async markPurchaseOrderSent(
    orderId: string,
    { sentAt, actorId }: { sentAt: Date; actorId: string },
  ): Promise<void> {
    await this.tx
      .update(purchaseOrders)
      .set({ state: "SENT", sentAt, sentBy: actorId })
      .where(eq(purchaseOrders.id, orderId));
  }

  async cancelPurchaseOrder(
    orderId: string,
    { cancelledAt, actorId }: { cancelledAt: Date; actorId: string },
  ): Promise<void> {
    await this.tx
      .update(purchaseOrders)
      .set({ state: "CANCELLED", cancelledAt, cancelledBy: actorId })
      .where(eq(purchaseOrders.id, orderId));
  }
}

export class DrizzlePurchaseOrderStore<TQueryResult extends PgQueryResultHKT>
  implements PurchaseOrderStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: PurchaseOrderStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzlePurchaseOrderStoreTransaction(tx)));
  }
}
