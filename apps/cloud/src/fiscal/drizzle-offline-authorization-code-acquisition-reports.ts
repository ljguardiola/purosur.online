import type {
  AcquisitionFailureReportStore,
  Fortnight,
  ReportableAcquisitionFailureKind,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { offlineAuthorizationCodeAcquisitionReports } from "../platform/db/schema.js";

export class DrizzleOfflineAuthorizationCodeAcquisitionReports<
  TQueryResult extends PgQueryResultHKT,
> implements AcquisitionFailureReportStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly clock: { now(): Date };

  constructor(db: PgDatabase<TQueryResult>, clock: { now(): Date }) {
    this.db = db;
    this.clock = clock;
  }

  async recordFirstReport(
    { start }: Fortnight,
    kind: ReportableAcquisitionFailureKind,
  ): Promise<boolean> {
    const inserted = await this.db
      .insert(offlineAuthorizationCodeAcquisitionReports)
      .values({ fortnightStart: start, outcomeKind: kind, reportedAt: this.clock.now() })
      .onConflictDoNothing()
      .returning({ fortnightStart: offlineAuthorizationCodeAcquisitionReports.fortnightStart });
    return inserted.length > 0;
  }
}
