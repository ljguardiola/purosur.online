import type {
  LockedLot,
  LotCostStore,
  LotCostTransaction,
  LotOriginKind,
} from "@purosur/domain/stock/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { lots } from "../platform/db/schema.js";

class DrizzleLotCostTransaction<TQueryResult extends PgQueryResultHKT>
  implements LotCostTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async lockLot(locationId: string, lotId: string): Promise<LockedLot | undefined> {
    const [lot] = await this.tx
      .select({
        technical: lots.technical,
        purchaseLineId: lots.purchaseLineId,
        assemblyBatchId: lots.assemblyBatchId,
        withdrawn: lots.withdrawn,
        remaining: lots.remaining,
      })
      .from(lots)
      .where(and(eq(lots.id, lotId), eq(lots.locationId, locationId)))
      .for("update");
    if (!lot) {
      return undefined;
    }
    const origin: LotOriginKind = lot.technical
      ? "technical"
      : lot.assemblyBatchId !== null
        ? "assembly_batch"
        : lot.purchaseLineId === null
          ? "initial_count"
          : "purchase";
    return { origin, withdrawn: lot.withdrawn, remaining: lot.remaining };
  }

  async setReferenceCost(
    lotId: string,
    cost: { totalCents: number; quantity: number },
  ): Promise<void> {
    const [updated] = await this.tx
      .update(lots)
      .set({ costTotalCents: cost.totalCents, costQuantity: cost.quantity, costIncomplete: false })
      .where(eq(lots.id, lotId))
      .returning({ id: lots.id });
    if (!updated) {
      throw new Error("setting the lot's reference cost updated no row");
    }
  }
}

export class DrizzleLotCostStore<TQueryResult extends PgQueryResultHKT> implements LotCostStore {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(work: (tx: LotCostTransaction) => Promise<TOutcome>): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleLotCostTransaction(tx)));
  }
}
