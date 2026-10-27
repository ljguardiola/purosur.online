import type { AssemblyBatchCost, AssemblyBatchCostReader } from "@purosur/domain/pricing/use-cases";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { assemblyBatches, lots } from "../platform/db/schema.js";

export class DrizzleAssemblyBatchCostReader<TQueryResult extends PgQueryResultHKT>
  implements AssemblyBatchCostReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async batchLotCostsOf(
    locationId: string,
    productIds: readonly string[],
  ): Promise<AssemblyBatchCost[]> {
    if (productIds.length === 0) {
      return [];
    }
    const batches = await this.db
      .select({
        productId: lots.productId,
        batchId: assemblyBatches.id,
        assembledAt: assemblyBatches.assembledAt,
        costIncomplete: lots.costIncomplete,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
      })
      .from(lots)
      .innerJoin(assemblyBatches, eq(assemblyBatches.id, lots.assemblyBatchId))
      .where(
        and(
          eq(lots.locationId, locationId),
          inArray(lots.productId, [...productIds]),
          isNull(assemblyBatches.voidedAt),
        ),
      );
    return batches.flatMap(({ costTotalCents, costQuantity, ...batch }) =>
      costTotalCents === null || costQuantity === null
        ? []
        : [{ ...batch, cost: { totalCents: costTotalCents, quantity: costQuantity } }],
    );
  }
}
