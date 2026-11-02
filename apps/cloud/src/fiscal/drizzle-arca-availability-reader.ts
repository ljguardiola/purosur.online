import { ARCA_REACHABILITY_HORIZON_MS, type ArcaAvailabilityRun } from "@purosur/domain";
import type {
  ArcaAvailabilityQuery,
  ArcaAvailabilityReader,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, gte, lt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { arcaVitalityChecks } from "../platform/db/schema.js";

const HORIZON_SECONDS = ARCA_REACHABILITY_HORIZON_MS / 1_000;

export class DrizzleArcaAvailabilityReader<TQueryResult extends PgQueryResultHKT>
  implements ArcaAvailabilityReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async availabilityRuns({ from, to }: ArcaAvailabilityQuery): Promise<ArcaAvailabilityRun[]> {
    const lookbackStart = new Date(from.getTime() - ARCA_REACHABILITY_HORIZON_MS);
    const window = sql`over (order by ${arcaVitalityChecks.checkedAt})`;
    const marked = this.db.$with("marked").as(
      this.db
        .select({
          checkedAt: arcaVitalityChecks.checkedAt,
          ok: arcaVitalityChecks.ok,
          startsRun: sql<number>`case
            when lag(${arcaVitalityChecks.ok}) ${window} is distinct from ${arcaVitalityChecks.ok}
              or ${arcaVitalityChecks.checkedAt} - lag(${arcaVitalityChecks.checkedAt}) ${window}
                > make_interval(secs => ${HORIZON_SECONDS})
            then 1 else 0 end`.as("starts_run"),
        })
        .from(arcaVitalityChecks)
        .where(
          and(
            gte(arcaVitalityChecks.checkedAt, lookbackStart),
            lt(arcaVitalityChecks.checkedAt, to),
          ),
        ),
    );
    const numbered = this.db.$with("numbered").as(
      this.db
        .with(marked)
        .select({
          checkedAt: marked.checkedAt,
          ok: marked.ok,
          runNumber: sql<number>`sum(${marked.startsRun}) over (order by ${marked.checkedAt})`.as(
            "run_number",
          ),
        })
        .from(marked),
    );
    const firstCheckedAt = sql<Date>`min(${numbered.checkedAt})`.mapWith(
      arcaVitalityChecks.checkedAt,
    );
    const lastCheckedAt = sql<Date>`max(${numbered.checkedAt})`.mapWith(
      arcaVitalityChecks.checkedAt,
    );
    return this.db
      .with(numbered)
      .select({ ok: numbered.ok, firstCheckedAt, lastCheckedAt })
      .from(numbered)
      .groupBy(numbered.runNumber, numbered.ok)
      .orderBy(asc(firstCheckedAt));
  }
}
