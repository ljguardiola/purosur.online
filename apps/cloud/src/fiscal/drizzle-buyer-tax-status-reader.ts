import { latestBuyerTaxStatusSet } from "@purosur/domain";
import type {
  BuyerTaxStatusReader,
  BuyerTaxStatusSetVersion,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { buyerTaxStatusSets } from "../platform/db/schema.js";

export class DrizzleBuyerTaxStatusReader<TQueryResult extends PgQueryResultHKT>
  implements BuyerTaxStatusReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async latestBuyerTaxStatusSet(): Promise<BuyerTaxStatusSetVersion | undefined> {
    const sets = await this.db
      .select({
        paramsVersion: buyerTaxStatusSets.paramsVersion,
        options: buyerTaxStatusSets.options,
      })
      .from(buyerTaxStatusSets);
    return latestBuyerTaxStatusSet(sets);
  }
}
