import { fortnightReportDeadline } from "@purosur/domain";
import type {
  BranchFortnightPresentation,
  FortnightPresentationReader,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { closedFortnightPresentations } from "./owed-fortnight-reports.js";

export class DrizzleFortnightPresentationReader<TQueryResult extends PgQueryResultHKT>
  implements FortnightPresentationReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async branchPresentations(
    locationId: string,
    today: string,
  ): Promise<BranchFortnightPresentation[]> {
    const presentations = await closedFortnightPresentations(this.db, today, locationId);
    return presentations
      .map(({ owed: { pointOfSaleNumber, registerId, code }, state }) => ({
        registerId,
        pointOfSaleNumber,
        fortnight: code.fortnight,
        deadline: fortnightReportDeadline(code.fortnight, code.reportDeadline),
        state,
      }))
      .sort(
        (a, b) =>
          b.fortnight.start.localeCompare(a.fortnight.start) ||
          a.pointOfSaleNumber - b.pointOfSaleNumber,
      );
  }
}
