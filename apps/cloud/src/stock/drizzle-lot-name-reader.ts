import type { LotNameFacts, LotNameReader } from "@purosur/domain/stock/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { assemblyBatches, lots, stockMovements } from "../platform/db/schema.js";

export class DrizzleLotNameReader<TQueryResult extends PgQueryResultHKT> implements LotNameReader {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async lotNameFacts(locationId: string, productIds: readonly string[]): Promise<LotNameFacts[]> {
    if (productIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({
        lotId: lots.id,
        productId: lots.productId,
        locationId: lots.locationId,
        nameOrder: lots.nameOrder,
        purchasedOn: lots.purchasedOn,
        purchased: lots.purchaseLineId,
        countedAt: stockMovements.occurredAt,
        assembledAt: assemblyBatches.assembledAt,
        openedAt: lots.createdAt,
      })
      .from(lots)
      .leftJoin(stockMovements, eq(stockMovements.id, lots.originMovementId))
      .leftJoin(assemblyBatches, eq(assemblyBatches.id, lots.assemblyBatchId))
      .where(and(eq(lots.locationId, locationId), inArray(lots.productId, [...productIds])));
    return rows.map(
      ({ purchasedOn, purchased, countedAt, assembledAt, openedAt, ...lot }): LotNameFacts => ({
        ...lot,
        origin:
          purchased !== null && purchasedOn !== null
            ? { kind: "purchase", purchasedOn }
            : countedAt !== null
              ? { kind: "initial_count", countedAt }
              : assembledAt !== null
                ? { kind: "assembly_batch", assembledAt }
                : { kind: "technical", openedAt },
      }),
    );
  }
}
