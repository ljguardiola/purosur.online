import { fortnightReportStateWhenListedAsOwed } from "@purosur/domain";
import type {
  OwedFortnightPresentation,
  OwedFortnightPresentationReader,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { owedFortnightReportsWithState } from "./owed-fortnight-reports.js";

export class DrizzleOwedFortnightPresentationReader<TQueryResult extends PgQueryResultHKT>
  implements OwedFortnightPresentationReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async owedPresentations(today: string): Promise<OwedFortnightPresentation[]> {
    const owed = await owedFortnightReportsWithState(this.db, today);
    return owed.map(({ owed: { pointOfSaleNumber, registerId, code }, state, listed }) => ({
      pointOfSaleNumber,
      registerId,
      fortnight: code.fortnight,
      taxAuthorityDeadline: code.reportDeadline,
      state: listed ? fortnightReportStateWhenListedAsOwed(state) : state,
    }));
  }
}
