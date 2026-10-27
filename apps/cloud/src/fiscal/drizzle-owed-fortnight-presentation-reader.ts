import { owedFortnightPresentationState, type ZoneRulesSource } from "@purosur/domain";
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
  private readonly zoneRules: ZoneRulesSource;

  constructor(db: PgDatabase<TQueryResult>, zoneRules: ZoneRulesSource) {
    this.db = db;
    this.zoneRules = zoneRules;
  }

  async owedPresentations(today: string): Promise<OwedFortnightPresentation[]> {
    const owed = await owedFortnightReportsWithState(this.db, today, this.zoneRules.zoneRules());
    return owed.map(({ owed: { pointOfSaleNumber, registerId, code }, state, listed }) => ({
      pointOfSaleNumber,
      registerId,
      fortnight: code.fortnight,
      taxAuthorityDeadline: code.reportDeadline,
      state: owedFortnightPresentationState({ state, listed }),
      listed,
    }));
  }
}
