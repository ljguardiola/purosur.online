import { latestThreshold, thresholdInEffectOn, thresholdScheduledAfter } from "@purosur/domain";
import type {
  BuyerIdentificationThresholdOverview,
  BuyerIdentificationThresholdReader,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { buyerIdentificationThresholds } from "../platform/db/schema.js";

export class DrizzleBuyerIdentificationThresholdReader<TQueryResult extends PgQueryResultHKT>
  implements BuyerIdentificationThresholdReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async readBuyerIdentificationThresholdOverview(
    day: string,
  ): Promise<BuyerIdentificationThresholdOverview> {
    const thresholds = await this.db
      .select({
        id: buyerIdentificationThresholds.id,
        amount: buyerIdentificationThresholds.amount,
        validFrom: buyerIdentificationThresholds.validFrom,
      })
      .from(buyerIdentificationThresholds);
    return {
      inEffect: thresholdInEffectOn(thresholds, day),
      scheduled: thresholdScheduledAfter(thresholds, day),
      latest: latestThreshold(thresholds),
    };
  }
}
