import type { SaleUnit } from "@purosur/domain";
import type {
  PurchaseOrderDetailListing,
  PurchaseOrderLineListing,
  PurchaseOrderListing,
  PurchaseOrderReader,
} from "@purosur/domain/purchasing/use-cases";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import {
  brands,
  products,
  purchaseOrderLines,
  purchaseOrders,
  supplierItems,
  suppliers,
} from "../platform/db/schema.js";

type OrderState = PurchaseOrderListing["state"];

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

  async order(
    locationId: string,
    orderId: string,
  ): Promise<PurchaseOrderDetailListing | undefined> {
    const [row] = await this.db
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
    const lineRows = await this.db
      .select({
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
    const items =
      lineRows.length === 0
        ? []
        : await this.db
            .select({
              productId: supplierItems.productId,
              quantity: supplierItems.quantity,
              keyKind: supplierItems.keyKind,
              keyValue: supplierItems.keyValue,
              description: supplierItems.description,
            })
            .from(supplierItems)
            .where(
              and(
                eq(supplierItems.supplierId, row.supplierId),
                inArray(
                  supplierItems.productId,
                  lineRows.map(({ productId }) => productId),
                ),
                eq(supplierItems.relinkRequired, false),
              ),
            )
            .orderBy(asc(supplierItems.keyKind), asc(supplierItems.keyValue));
    const lines: PurchaseOrderLineListing[] = lineRows.map((line) => {
      const item = items.find(
        ({ productId, quantity }) =>
          productId === line.productId && quantity === line.quantityPerPackage,
      );
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
    };
  }
}
