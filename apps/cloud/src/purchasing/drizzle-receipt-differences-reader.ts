import { ARGENTINA_TIME_ZONE, type ReceiptLineRow, type SaleUnit } from "@purosur/domain";
import type {
  ReceiptDifferencesQuery,
  ReceiptDifferencesReader,
} from "@purosur/domain/purchasing/use-cases";
import { and, asc, between, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import {
  brands,
  products,
  purchaseOrderLines,
  purchaseOrderReceiptLines,
  purchaseOrderReceipts,
  purchaseOrders,
  suppliers,
} from "../platform/db/schema.js";

const READ_SNAPSHOT = { isolationLevel: "repeatable read", accessMode: "read only" } as const;

const receivedDay = sql<string>`to_char(${purchaseOrderReceipts.receivedAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

export class DrizzleReceiptDifferencesReader<TQueryResult extends PgQueryResultHKT>
  implements ReceiptDifferencesReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  receiptLines(query: ReceiptDifferencesQuery): Promise<ReceiptLineRow[]> {
    return this.db.transaction((tx) => this.readIn(tx, query), READ_SNAPSHOT);
  }

  private async readIn(
    db: PgDatabase<TQueryResult>,
    { locationId, range }: ReceiptDifferencesQuery,
  ): Promise<ReceiptLineRow[]> {
    const rows = await db
      .select({
        receiptId: purchaseOrderReceipts.id,
        orderId: purchaseOrders.id,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        receivedOn: receivedDay,
        receivedAt: purchaseOrderReceipts.receivedAt,
        productId: products.id,
        productName: products.name,
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        saleUnit: products.saleUnit,
        receivedQuantity: purchaseOrderReceiptLines.receivedQuantity,
        missingQuantity: purchaseOrderReceiptLines.missingQuantity,
        priceDifferenceCents: purchaseOrderReceiptLines.priceDifferenceCents,
      })
      .from(purchaseOrderReceiptLines)
      .innerJoin(
        purchaseOrderReceipts,
        eq(purchaseOrderReceipts.id, purchaseOrderReceiptLines.purchaseOrderReceiptId),
      )
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderReceipts.purchaseOrderId))
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .innerJoin(
        purchaseOrderLines,
        eq(purchaseOrderLines.id, purchaseOrderReceiptLines.purchaseOrderLineId),
      )
      .innerJoin(products, eq(products.id, purchaseOrderLines.productId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(
        and(eq(purchaseOrders.locationId, locationId), between(receivedDay, range.from, range.to)),
      )
      .orderBy(asc(purchaseOrderReceipts.receivedAt), asc(purchaseOrderReceipts.id));
    return rows.map((row) => ({
      receiptId: row.receiptId,
      orderId: row.orderId,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      receivedOn: row.receivedOn,
      receivedAt: row.receivedAt,
      product: {
        id: row.productId,
        name: row.productName,
        brandName: row.brandName,
        netContent: netContentRow(row),
        saleUnit: row.saleUnit as SaleUnit,
      },
      receivedQuantity: row.receivedQuantity,
      missingQuantity: row.missingQuantity,
      priceDifferenceCents: row.priceDifferenceCents,
    }));
  }
}
