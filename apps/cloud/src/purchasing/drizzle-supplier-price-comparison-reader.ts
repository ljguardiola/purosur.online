import type { SaleUnit } from "@purosur/domain";
import type {
  ComparableProduct,
  SupplierOffer,
  SupplierPriceComparisonReader,
} from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import { brands, categories, products } from "../platform/db/schema.js";
import { latestSupplierOffers } from "./latest-supplier-offers.js";

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
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        categoryName: categories.name,
        saleUnit: products.saleUnit,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(eq(products.active, true));
    return rows.map(({ netContentQuantity, netContentUnit, ...row }) => ({
      ...row,
      netContent: netContentRow({ netContentQuantity, netContentUnit }),
      saleUnit: row.saleUnit as SaleUnit,
    }));
  }

  async offers(): Promise<SupplierOffer[]> {
    const offers = await latestSupplierOffers(this.db);
    return offers.map(({ supplierItemId: _supplierItemId, ...offer }) => offer);
  }
}
