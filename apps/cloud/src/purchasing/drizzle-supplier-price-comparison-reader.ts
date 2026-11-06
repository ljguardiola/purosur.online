import type {
  ComparableProduct,
  SupplierOffer,
  SupplierPriceComparisonReader,
} from "@purosur/domain/purchasing/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleComparableProductReader } from "../catalog/drizzle-comparable-product-reader.js";
import { latestSupplierOffers } from "./latest-supplier-offers.js";

export class DrizzleSupplierPriceComparisonReader<TQueryResult extends PgQueryResultHKT>
  implements SupplierPriceComparisonReader
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly comparableProducts: DrizzleComparableProductReader<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
    this.comparableProducts = new DrizzleComparableProductReader(db);
  }

  async activeProducts(): Promise<ComparableProduct[]> {
    return this.comparableProducts.activeProducts();
  }

  async offers(): Promise<SupplierOffer[]> {
    const offers = await latestSupplierOffers(this.db);
    return offers.map(({ supplierItemId: _supplierItemId, ...offer }) => offer);
  }
}
