import type { SoldLinesOfGroup } from "@purosur/domain";
import type {
  OrderSuggestionReader,
  OrderSuggestionSalesQuery,
  ProductCoverageDays,
  ProductStock,
} from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products, stockBalances } from "../platform/db/schema.js";
import { DrizzleProductSalesReportReader } from "../sales/drizzle-product-sales-report-reader.js";
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
}
