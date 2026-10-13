import type { InitialCountCost, InitialCountCostReader } from "@purosur/domain/pricing/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { lots, stockMovements } from "../platform/db/schema.js";

export class DrizzleInitialCountCostReader<TQueryResult extends PgQueryResultHKT>
  implements InitialCountCostReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async initialCountCostsOf(
    locationId: string,
    productIds: readonly string[],
  ): Promise<InitialCountCost[]> {
    if (productIds.length === 0) {
      return [];
    }
    const counted = await this.db
      .select({
        productId: lots.productId,
        countedAt: stockMovements.occurredAt,
        withdrawn: lots.withdrawn,
        costIncomplete: lots.costIncomplete,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
      })
      .from(lots)
      .innerJoin(stockMovements, eq(stockMovements.id, lots.originMovementId))
      .where(and(eq(lots.locationId, locationId), inArray(lots.productId, [...productIds])));
    return counted.map(({ costTotalCents, costQuantity, ...count }) => ({
      ...count,
      cost:
        costTotalCents === null || costQuantity === null
          ? null
          : { totalCents: costTotalCents, quantity: costQuantity },
    }));
  }
}
