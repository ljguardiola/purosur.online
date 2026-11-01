import { countsForShelfLife, type SoldLinesOfGroup } from "@purosur/domain";
import type {
  NewestShelfLifeLot,
  OrderSuggestionReader,
  OrderSuggestionSalesQuery,
  OrderSuggestionSupplier,
  ProductCoverageDays,
  ProductStock,
} from "@purosur/domain/purchasing/use-cases";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  assemblyBatches,
  lots,
  products,
  stockBalances,
  suppliers,
} from "../platform/db/schema.js";
import { DrizzleProductSalesReportReader } from "../sales/drizzle-product-sales-report-reader.js";
import { lotOriginOf } from "../stock/lot-origin.js";
import { DrizzleSupplierPriceComparisonReader } from "./drizzle-supplier-price-comparison-reader.js";

export class DrizzleOrderSuggestionReader<TQueryResult extends PgQueryResultHKT>
  extends DrizzleSupplierPriceComparisonReader<TQueryResult>
  implements OrderSuggestionReader
{
  private readonly database: PgDatabase<TQueryResult>;
  private readonly sales: DrizzleProductSalesReportReader<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    super(db);
    this.database = db;
    this.sales = new DrizzleProductSalesReportReader(db);
  }

  async coverageDays(): Promise<ProductCoverageDays[]> {
    return this.database
      .select({ productId: products.id, coverageDays: products.coverageDays })
      .from(products)
      .where(eq(products.active, true));
  }

  async completedSalesByProduct({
    locationId,
    range,
  }: OrderSuggestionSalesQuery): Promise<SoldLinesOfGroup[]> {
    return this.sales.completedSalesByProduct({ locationId, range, registerId: undefined });
  }

  async currentStock(locationId: string): Promise<ProductStock[]> {
    return this.database
      .select({ productId: stockBalances.productId, quantity: stockBalances.quantity })
      .from(stockBalances)
      .where(eq(stockBalances.locationId, locationId));
  }

  async suppliers(): Promise<OrderSuggestionSupplier[]> {
    return this.database
      .select({ id: suppliers.id, name: suppliers.name, active: suppliers.active })
      .from(suppliers);
  }

  async newestShelfLifeLots(locationId: string): Promise<NewestShelfLifeLot[]> {
    const rows = await this.database
      .select({
        productId: lots.productId,
        createdAt: lots.createdAt,
        expiresOn: lots.expiresOn,
        technical: lots.technical,
        purchaseLineId: lots.purchaseLineId,
        assemblyBatchId: lots.assemblyBatchId,
        batchVoidedAt: assemblyBatches.voidedAt,
      })
      .from(lots)
      .leftJoin(assemblyBatches, eq(assemblyBatches.id, lots.assemblyBatchId))
      .where(and(eq(lots.locationId, locationId), isNotNull(lots.expiresOn)))
      .orderBy(desc(lots.createdAt), desc(lots.id));
    const newest = new Map<string, NewestShelfLifeLot>();
    for (const row of rows) {
      const counted = {
        expiresOn: row.expiresOn,
        origin: lotOriginOf(row),
        batchVoided: row.batchVoidedAt !== null,
      };
      if (countsForShelfLife(counted) && !newest.has(row.productId)) {
        newest.set(row.productId, {
          productId: row.productId,
          createdAt: row.createdAt,
          expiresOn: counted.expiresOn,
        });
      }
    }
    return [...newest.values()];
  }
}
