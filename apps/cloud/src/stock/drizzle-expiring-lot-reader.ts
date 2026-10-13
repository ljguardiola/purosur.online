import type { SaleUnit } from "@purosur/domain";
import type { ExpiringLotReader, ExpiringLotRow } from "@purosur/domain/stock/use-cases";
import { and, eq, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { categories, lots, products } from "../platform/db/schema.js";

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
        categoryId: categories.id,
        categoryName: categories.name,
        saleUnit: products.saleUnit,
      })
      .from(lots)
      .innerJoin(products, eq(products.id, lots.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(and(eq(lots.locationId, locationId), lte(lots.expiresOn, lastDay)));
    return rows.map(
      ({
        costTotalCents,
        costQuantity,
        productId,
        productName,
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
          categoryId,
          categoryName,
          saleUnit: saleUnit as SaleUnit,
        },
      }),
    );
  }
}
