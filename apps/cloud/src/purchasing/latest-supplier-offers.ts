import type { SaleUnit } from "@purosur/domain";
import type { SupplierOffer } from "@purosur/domain/purchasing/use-cases";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products, supplierItemPrices, supplierItems, suppliers } from "../platform/db/schema.js";

export interface LatestSupplierOffer extends SupplierOffer {
  supplierItemId: string;
}

// Each supplier item's latest price: the latest list by date, a tie going to the list confirmed
// later; ordered by supplier name.
export async function latestSupplierOffers<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  productIds?: readonly string[],
): Promise<LatestSupplierOffer[]> {
  if (productIds?.length === 0) {
    return [];
  }
  const latest = db
    .selectDistinctOn([supplierItems.id], {
      supplierItemId: sql<string>`${supplierItems.id}`.as("supplier_item_id"),
      productId: sql<string>`${products.id}`.as("product_id"),
      supplierId: sql<string>`${suppliers.id}`.as("supplier_id"),
      supplierName: sql<string>`${suppliers.name}`.as("supplier_name"),
      quantity: sql<number>`${supplierItems.quantity}`.as("link_quantity"),
      saleUnit: sql<string>`${supplierItems.saleUnit}`.as("link_sale_unit"),
      relinkRequired: sql<boolean>`${supplierItems.relinkRequired}`.as("link_relink_required"),
      priceCents: supplierItemPrices.priceCents,
      pricesIncludeVat: supplierItemPrices.pricesIncludeVat,
      vatRate: supplierItems.vatRate,
      listDate: supplierItemPrices.listDate,
    })
    .from(supplierItems)
    .innerJoin(products, eq(products.id, supplierItems.productId))
    .innerJoin(suppliers, eq(suppliers.id, supplierItems.supplierId))
    .innerJoin(supplierItemPrices, eq(supplierItemPrices.itemId, supplierItems.id))
    .where(productIds === undefined ? undefined : inArray(supplierItems.productId, [...productIds]))
    .orderBy(
      supplierItems.id,
      desc(supplierItemPrices.listDate),
      desc(supplierItemPrices.confirmedAt),
    )
    .as("latest_item_price");
  const rows = await db
    .select()
    .from(latest)
    .orderBy(asc(latest.supplierName), asc(latest.supplierId), asc(latest.quantity));
  return rows.map(({ supplierId, supplierName, quantity, saleUnit, relinkRequired, ...offer }) => ({
    ...offer,
    supplier: { id: supplierId, name: supplierName },
    link: { quantity, saleUnit: saleUnit as SaleUnit, relinkRequired },
  }));
}
