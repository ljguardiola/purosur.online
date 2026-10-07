import type {
  ArcaReachabilityEvidence,
  ArcaReachabilityReader,
} from "@purosur/domain/fiscal/use-cases";
import { desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { arcaVitalityChecks } from "../platform/db/schema.js";

export class DrizzleArcaReachabilityReader<TQueryResult extends PgQueryResultHKT>
  implements ArcaReachabilityReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async reachabilityEvidence(): Promise<ArcaReachabilityEvidence> {
    const [latestOk] = await this.db
      .select({ checkedAt: arcaVitalityChecks.checkedAt })
      .from(arcaVitalityChecks)
      .where(eq(arcaVitalityChecks.ok, true))
      .orderBy(desc(arcaVitalityChecks.checkedAt))
      .limit(1);
    return { lastVitalityCheckOkAt: latestOk?.checkedAt ?? null, lastWsfeCallOkAt: null };
  }
}
