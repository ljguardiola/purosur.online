import type {
  FortnightPresentationNeedingRegularization,
  FortnightRegularizationReader,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fortnightReports, pointOfSaleClaims } from "../platform/db/schema.js";

export class DrizzleFortnightRegularizationReader<TQueryResult extends PgQueryResultHKT>
  implements FortnightRegularizationReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async presentationsNeedingRegularization(): Promise<
    FortnightPresentationNeedingRegularization[]
  > {
    const rows = await this.db
      .select({
        pointOfSaleNumber: fortnightReports.pointOfSaleNumber,
        registerId: pointOfSaleClaims.registerId,
        fortnightStart: fortnightReports.fortnightStart,
        fortnightEnd: fortnightReports.fortnightEnd,
      })
      .from(fortnightReports)
      .innerJoin(
        pointOfSaleClaims,
        eq(pointOfSaleClaims.pointOfSaleNumber, fortnightReports.pointOfSaleNumber),
      )
      .where(
        and(
          eq(fortnightReports.state, "needs_regularization"),
          eq(pointOfSaleClaims.mechanism, "offline"),
        ),
      );
    return rows.map(({ pointOfSaleNumber, registerId, fortnightStart, fortnightEnd }) => ({
      pointOfSaleNumber,
      registerId,
      fortnight: { start: fortnightStart, end: fortnightEnd },
    }));
  }
}
