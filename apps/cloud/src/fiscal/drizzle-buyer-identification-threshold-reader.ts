import type { BuyerIdentificationThreshold } from "@purosur/domain";
import type { BuyerIdentificationThresholdReader } from "@purosur/domain/fiscal/use-cases";
import { desc } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { buyerIdentificationThresholds } from "../platform/db/schema.js";

export class DrizzleBuyerIdentificationThresholdReader<TQueryResult extends PgQueryResultHKT>
  implements BuyerIdentificationThresholdReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  listBuyerIdentificationThresholds(): Promise<BuyerIdentificationThreshold[]> {
    return this.db
      .select({
        id: buyerIdentificationThresholds.id,
        amount: buyerIdentificationThresholds.amount,
        validFrom: buyerIdentificationThresholds.validFrom,
      })
      .from(buyerIdentificationThresholds)
      .orderBy(desc(buyerIdentificationThresholds.validFrom));
  }
}
