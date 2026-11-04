import { type SaleUnit, supplierOfferOfOrderLine } from "@purosur/domain";
import type {
  PurchaseOrderDetailListing,
  PurchaseOrderLineListing,
  PurchaseOrderListing,
  PurchaseOrderReader,
  PurchaseOrderReceiptListing,
  ReceivableOrderListing,
} from "@purosur/domain/purchasing/use-cases";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import {
  brands,
  products,
  purchaseOrderLines,
  purchaseOrderReceiptLines,
  purchaseOrderReceipts,
  purchaseOrders,
  supplierItems,
  suppliers,
} from "../platform/db/schema.js";
import { latestSupplierOffers } from "./latest-supplier-offers.js";

type OrderState = PurchaseOrderListing["state"];

const READ_SNAPSHOT = { isolationLevel: "repeatable read", accessMode: "read only" } as const;

export class DrizzlePurchaseOrderReader<TQueryResult extends PgQueryResultHKT>
  implements PurchaseOrderReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async orders(locationId: string, state?: OrderState): Promise<PurchaseOrderListing[]> {
    const rows = await this.db
      .select({
        id: purchaseOrders.id,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        state: purchaseOrders.state,
        createdAt: purchaseOrders.createdAt,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(
        and(
          eq(purchaseOrders.locationId, locationId),
          state === undefined ? undefined : eq(purchaseOrders.state, state),
        ),
      )
      .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id));
    if (rows.length === 0) {
      return [];
    }
    const lineRows = await this.db
      .select({
        purchaseOrderId: purchaseOrderLines.purchaseOrderId,
        packages: purchaseOrderLines.packages,
        expectedPackagePriceCents: purchaseOrderLines.expectedPackagePriceCents,
      })
      .from(purchaseOrderLines)
      .where(
        inArray(
          purchaseOrderLines.purchaseOrderId,
          rows.map(({ id }) => id),
        ),
      );
    return rows.map(({ supplierId, supplierName, state: rowState, ...order }) => ({
      ...order,
      supplier: { id: supplierId, name: supplierName },
      state: rowState as OrderState,
      lines: lineRows
        .filter((line) => line.purchaseOrderId === order.id)
        .map(({ packages, expectedPackagePriceCents }) => ({
          packages,
          expectedPackagePriceCents,
        })),
    }));
  }

  order(locationId: string, orderId: string): Promise<PurchaseOrderDetailListing | undefined> {
    return this.db.transaction((tx) => this.orderIn(tx, locationId, orderId), READ_SNAPSHOT);
  }

  private async orderIn(
    db: PgDatabase<TQueryResult>,
    locationId: string,
    orderId: string,
  ): Promise<PurchaseOrderDetailListing | undefined> {
    const [row] = await db
      .select({
        id: purchaseOrders.id,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        state: purchaseOrders.state,
        createdAt: purchaseOrders.createdAt,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(and(eq(purchaseOrders.id, orderId), eq(purchaseOrders.locationId, locationId)));
    if (!row) {
      return undefined;
    }
    const lineRows = await db
      .select({
        id: purchaseOrderLines.id,
        productId: products.id,
        productName: products.name,
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        saleUnit: products.saleUnit,
        packages: purchaseOrderLines.packages,
        quantityPerPackage: purchaseOrderLines.quantityPerPackage,
        expectedPackagePriceCents: purchaseOrderLines.expectedPackagePriceCents,
      })
      .from(purchaseOrderLines)
      .innerJoin(products, eq(products.id, purchaseOrderLines.productId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(eq(purchaseOrderLines.purchaseOrderId, orderId))
      .orderBy(asc(purchaseOrderLines.position));
    const lineOffers = await this.offersOfLines(db, row.supplierId, lineRows);
    const receivedByLine = await this.receivedQuantities(db, orderId);
    const itemIds = lineOffers.flatMap((offer) => (offer ? [offer.supplierItemId] : []));
    const items =
      itemIds.length === 0
        ? []
        : await db
            .select({
              id: supplierItems.id,
              keyKind: supplierItems.keyKind,
              keyValue: supplierItems.keyValue,
              description: supplierItems.description,
            })
            .from(supplierItems)
            .where(inArray(supplierItems.id, itemIds));
    const lines: PurchaseOrderLineListing[] = lineRows.map((line, index) => {
      const item = items.find(({ id }) => id === lineOffers[index]?.supplierItemId);
      return {
        product: {
          id: line.productId,
          name: line.productName,
          brandName: line.brandName,
          netContent: netContentRow(line),
          saleUnit: line.saleUnit as SaleUnit,
        },
        packages: line.packages,
        quantityPerPackage: line.quantityPerPackage,
        expectedPackagePriceCents: line.expectedPackagePriceCents,
        receivedQuantity: receivedByLine.get(line.id) ?? 0,
        supplierItem: item
          ? {
              code: item.keyKind === "code" ? item.keyValue : null,
              description: item.description,
            }
          : null,
      };
    });
    return {
      id: row.id,
      supplier: { id: row.supplierId, name: row.supplierName },
      state: row.state as OrderState,
      createdAt: row.createdAt,
      lines,
      receipts: await this.receipts(db, orderId),
    };
  }

  receivableOrder(
    locationId: string,
    orderId: string,
  ): Promise<ReceivableOrderListing | undefined> {
    return this.db.transaction(
      (tx) => this.receivableOrderIn(tx, locationId, orderId),
      READ_SNAPSHOT,
    );
  }

  private async receivableOrderIn(
    db: PgDatabase<TQueryResult>,
    locationId: string,
    orderId: string,
  ): Promise<ReceivableOrderListing | undefined> {
    const [row] = await db
      .select({
        id: purchaseOrders.id,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        state: purchaseOrders.state,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(and(eq(purchaseOrders.id, orderId), eq(purchaseOrders.locationId, locationId)));
    if (!row) {
      return undefined;
    }
    const lineRows = await db
      .select({
        id: purchaseOrderLines.id,
        productId: products.id,
        productName: products.name,
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        saleUnit: products.saleUnit,
        packages: purchaseOrderLines.packages,
        quantityPerPackage: purchaseOrderLines.quantityPerPackage,
      })
      .from(purchaseOrderLines)
      .innerJoin(products, eq(products.id, purchaseOrderLines.productId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(eq(purchaseOrderLines.purchaseOrderId, orderId))
      .orderBy(asc(purchaseOrderLines.position));
    const lineOffers = await this.offersOfLines(db, row.supplierId, lineRows);
    const receivedByLine = await this.receivedQuantities(db, orderId);
    return {
      id: row.id,
      supplier: { id: row.supplierId, name: row.supplierName },
      state: row.state as OrderState,
      lines: lineRows.map((line, index) => {
        const offer = lineOffers[index];
        return {
          product: {
            id: line.productId,
            name: line.productName,
            brandName: line.brandName,
            netContent: netContentRow(line),
            saleUnit: line.saleUnit as SaleUnit,
          },
          packages: line.packages,
          quantityPerPackage: line.quantityPerPackage,
          receivedQuantity: receivedByLine.get(line.id) ?? 0,
          supplierOffer: offer
            ? {
                link: offer.link,
                priceCents: offer.priceCents,
                pricesIncludeVat: offer.pricesIncludeVat,
                vatRate: offer.vatRate,
              }
            : null,
        };
      }),
    };
  }

  private async offersOfLines(
    db: PgDatabase<TQueryResult>,
    supplierId: string,
    lineRows: readonly { productId: string; saleUnit: string; quantityPerPackage: number }[],
  ) {
    const offers = (
      await latestSupplierOffers(
        db,
        lineRows.map(({ productId }) => productId),
      )
    ).filter((offer) => offer.supplier.id === supplierId);
    return lineRows.map((line) =>
      supplierOfferOfOrderLine(
        offers.filter((offer) => offer.productId === line.productId),
        line.saleUnit as SaleUnit,
        line.quantityPerPackage,
      ),
    );
  }

  private async receivedQuantities(
    db: PgDatabase<TQueryResult>,
    orderId: string,
  ): Promise<Map<string, number>> {
    const rows = await db
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

  private async receipts(
    db: PgDatabase<TQueryResult>,
    orderId: string,
  ): Promise<PurchaseOrderReceiptListing[]> {
    const receiptRows = await db
      .select({
        id: purchaseOrderReceipts.id,
        receivedAt: purchaseOrderReceipts.receivedAt,
        purchaseId: purchaseOrderReceipts.purchaseId,
      })
      .from(purchaseOrderReceipts)
      .where(eq(purchaseOrderReceipts.purchaseOrderId, orderId))
      .orderBy(asc(purchaseOrderReceipts.receivedAt), asc(purchaseOrderReceipts.id));
    if (receiptRows.length === 0) {
      return [];
    }
    const lineRows = await db
      .select({
        receiptId: purchaseOrderReceiptLines.purchaseOrderReceiptId,
        productId: purchaseOrderLines.productId,
        receivedQuantity: purchaseOrderReceiptLines.receivedQuantity,
        missingQuantity: purchaseOrderReceiptLines.missingQuantity,
        priceDifferenceCents: purchaseOrderReceiptLines.priceDifferenceCents,
      })
      .from(purchaseOrderReceiptLines)
      .innerJoin(
        purchaseOrderLines,
        eq(purchaseOrderLines.id, purchaseOrderReceiptLines.purchaseOrderLineId),
      )
      .where(
        inArray(
          purchaseOrderReceiptLines.purchaseOrderReceiptId,
          receiptRows.map(({ id }) => id),
        ),
      )
      .orderBy(asc(purchaseOrderLines.position));
    return receiptRows.map((receipt) => ({
      ...receipt,
      lines: lineRows
        .filter((line) => line.receiptId === receipt.id)
        .map(({ receiptId: _receiptId, ...line }) => line),
    }));
  }
}
