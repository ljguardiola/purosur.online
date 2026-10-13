import type { SaleUnit } from "@purosur/domain";
import type {
  InitialCountLotReader,
  InitialCountLotRow,
  InitialCountLotsQuery,
} from "@purosur/domain/stock/use-cases";
import { and, eq, ilike, isNotNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { containsPattern } from "../platform/contains-pattern.js";
import { categories, lots, products } from "../platform/db/schema.js";

export class DrizzleInitialCountLotReader<TQueryResult extends PgQueryResultHKT>
  implements InitialCountLotReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async initialCountLots(query: InitialCountLotsQuery): Promise<InitialCountLotRow[]> {
    const rows = await this.db
      .select({
        lotId: lots.id,
        productId: products.id,
        productName: products.name,
        categoryName: categories.name,
        saleUnit: products.saleUnit,
        expiresOn: lots.expiresOn,
        counted: lots.quantityReceived,
        withdrawn: lots.withdrawn,
        remaining: lots.remaining,
        costIncomplete: lots.costIncomplete,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
      })
      .from(lots)
      .innerJoin(products, eq(products.id, lots.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(lots.locationId, query.locationId),
          isNotNull(lots.originMovementId),
          query.costIncomplete === undefined
            ? undefined
            : eq(lots.costIncomplete, query.costIncomplete),
          query.productName === undefined
            ? undefined
            : ilike(products.name, containsPattern(query.productName)),
        ),
      );
    return rows.map(({ costTotalCents, costQuantity, saleUnit, ...row }) => ({
      ...row,
      saleUnit: saleUnit as SaleUnit,
      cost:
        costTotalCents === null || costQuantity === null
          ? null
          : { totalCents: costTotalCents, quantity: costQuantity },
    }));
  }
}
