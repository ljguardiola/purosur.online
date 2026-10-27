import type { SaleUnit } from "@purosur/domain";
import type {
  ComparableProduct,
  SupplierOffer,
  SupplierPriceComparisonReader,
} from "@purosur/domain/purchasing/use-cases";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  categories,
  productPackagings,
  products,
  supplierItemPrices,
  supplierItems,
  suppliers,
} from "../platform/db/schema.js";

export class DrizzleSupplierPriceComparisonReader<TQueryResult extends PgQueryResultHKT>
  implements SupplierPriceComparisonReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async activeProducts(): Promise<ComparableProduct[]> {
    const rows = await this.db
      .select({
        id: products.id,
        name: products.name,
        categoryName: categories.name,
        saleUnit: products.saleUnit,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(eq(products.active, true));
    return rows.map((row) => ({ ...row, saleUnit: row.saleUnit as SaleUnit }));
  }

  async offers(): Promise<SupplierOffer[]> {
    const latest = this.db
      .selectDistinctOn([supplierItems.id], {
        productId: sql<string>`${products.id}`.as("product_id"),
        supplierId: sql<string>`${suppliers.id}`.as("supplier_id"),
        supplierName: sql<string>`${suppliers.name}`.as("supplier_name"),
        packagingName: sql<string>`${productPackagings.name}`.as("packaging_name"),
        quantityPerPackage: productPackagings.quantityPerPackage,
        packagingActive: sql<boolean>`${productPackagings.active}`.as("packaging_active"),
        packagingSaleUnit: sql<string>`${productPackagings.saleUnit}`.as("packaging_sale_unit"),
        priceCents: supplierItemPrices.priceCents,
        pricesIncludeVat: supplierItemPrices.pricesIncludeVat,
        vatRate: supplierItems.vatRate,
        listDate: supplierItemPrices.listDate,
      })
      .from(supplierItems)
      .innerJoin(products, eq(products.id, supplierItems.productId))
      .innerJoin(productPackagings, eq(productPackagings.id, supplierItems.packagingId))
      .innerJoin(suppliers, eq(suppliers.id, supplierItems.supplierId))
      .innerJoin(supplierItemPrices, eq(supplierItemPrices.itemId, supplierItems.id))
      .orderBy(
        supplierItems.id,
        desc(supplierItemPrices.listDate),
        desc(supplierItemPrices.confirmedAt),
      )
      .as("latest_item_price");
    const rows = await this.db
      .select()
      .from(latest)
      .orderBy(asc(latest.supplierName), asc(latest.supplierId), asc(latest.packagingName));
    return rows.map(
      ({
        supplierId,
        supplierName,
        packagingName,
        quantityPerPackage,
        packagingActive,
        packagingSaleUnit,
        ...offer
      }) => ({
        ...offer,
        supplier: { id: supplierId, name: supplierName },
        packaging: {
          name: packagingName,
          quantityPerPackage,
          active: packagingActive,
          saleUnit: packagingSaleUnit as SaleUnit,
        },
      }),
    );
  }
}
