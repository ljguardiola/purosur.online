import type { SaleUnit } from "@purosur/domain";
import type { ExpiringLotReader, ExpiringLotRow } from "@purosur/domain/stock/use-cases";
import { and, eq, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import { brands, categories, lots, products } from "../platform/db/schema.js";

export class DrizzleExpiringLotReader<TQueryResult extends PgQueryResultHKT>
  implements ExpiringLotReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async lotsExpiringBy(locationId: string, lastDay: string): Promise<ExpiringLotRow[]> {
    const rows = await this.db
      .select({
        id: lots.id,
        lotNumber: lots.lotNumber,
        expiresOn: lots.expiresOn,
        technical: lots.technical,
        remaining: lots.remaining,
        costIncomplete: lots.costIncomplete,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
        productId: products.id,
        productName: products.name,
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        categoryId: categories.id,
        categoryName: categories.name,
        saleUnit: products.saleUnit,
      })
      .from(lots)
      .innerJoin(products, eq(products.id, lots.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(and(eq(lots.locationId, locationId), lte(lots.expiresOn, lastDay)));
    return rows.map(
      ({
        costTotalCents,
        costQuantity,
        productId,
        productName,
        brandName,
        netContentQuantity,
        netContentUnit,
        categoryId,
        categoryName,
        saleUnit,
        ...lot
      }) => ({
        ...lot,
        cost:
          costTotalCents === null || costQuantity === null
            ? null
            : { totalCents: costTotalCents, quantity: costQuantity },
        product: {
          id: productId,
          name: productName,
          brandName,
          netContent: netContentRow({ netContentQuantity, netContentUnit }),
          categoryId,
          categoryName,
          saleUnit: saleUnit as SaleUnit,
        },
      }),
    );
  }
}
