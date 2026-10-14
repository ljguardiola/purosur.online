import { fortnightClosesAt } from "@purosur/domain";
import type {
  FortnightReportChange,
  FortnightReportKey,
  FortnightReportStore,
  HeldFortnightReport,
  OwedFortnightReport,
  RecordedFortnightReport,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, lt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { caeaCodes, fortnightReports, pointOfSaleClaims } from "../platform/db/schema.js";

const STATES_THAT_ARE_AN_ATTEMPT = new Set<FortnightReportChange["state"]>([
  "submitting",
  "refused",
  "accepted",
]);

function fortnightReportLockKey({ pointOfSaleNumber, fortnight }: FortnightReportKey): string {
  return `fortnight_report:${pointOfSaleNumber}:${fortnight.start}`;
}

class DrizzleHeldFortnightReport<TQueryResult extends PgQueryResultHKT>
  implements HeldFortnightReport
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly key: FortnightReportKey;

  constructor(db: PgDatabase<TQueryResult>, key: FortnightReportKey) {
    this.db = db;
    this.key = key;
  }

  async recorded(): Promise<RecordedFortnightReport | null> {
    const [row] = await this.db
      .select({ state: fortnightReports.state, lastAttemptAt: fortnightReports.lastAttemptAt })
      .from(fortnightReports)
      .where(this.rowMatch());
    return row ?? null;
  }

  async record({ state, at, rejections }: FortnightReportChange): Promise<void> {
    const attempt = STATES_THAT_ARE_AN_ATTEMPT.has(state) ? { lastAttemptAt: at } : {};
    const { pointOfSaleNumber, fortnight } = this.key;
    await this.db
      .insert(fortnightReports)
      .values({
        pointOfSaleNumber,
        fortnightStart: fortnight.start,
        fortnightEnd: fortnight.end,
        state,
        rejections: rejections ?? null,
        recordedAt: at,
        ...attempt,
      })
      .onConflictDoUpdate({
        target: [fortnightReports.pointOfSaleNumber, fortnightReports.fortnightStart],
        set: { state, rejections: rejections ?? null, recordedAt: at, ...attempt },
      });
  }

  private rowMatch() {
    return and(
      eq(fortnightReports.pointOfSaleNumber, this.key.pointOfSaleNumber),
      eq(fortnightReports.fortnightStart, this.key.fortnight.start),
    );
  }
}

// A presentation holds a session-level advisory lock across the calls to ARCA and records in
// autocommit, so the database handle must be bound to one connection for the whole presentation:
// the lock and its release have to run on the connection that took it.
export class DrizzleFortnightReportStore<TQueryResult extends PgQueryResultHKT>
  implements FortnightReportStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async owedReports(today: string): Promise<OwedFortnightReport[]> {
    const codes = await this.db.select().from(caeaCodes).where(lt(caeaCodes.fortnightEnd, today));
    const claims = await this.db
      .select({
        pointOfSaleNumber: pointOfSaleClaims.pointOfSaleNumber,
        registerId: pointOfSaleClaims.registerId,
        claimedAt: pointOfSaleClaims.claimedAt,
      })
      .from(pointOfSaleClaims)
      .where(eq(pointOfSaleClaims.mechanism, "offline"));
    const accepted = await this.db
      .select({
        pointOfSaleNumber: fortnightReports.pointOfSaleNumber,
        fortnightStart: fortnightReports.fortnightStart,
      })
      .from(fortnightReports)
      .where(eq(fortnightReports.state, "accepted"));
    const isAccepted = new Set(
      accepted.map(
        ({ pointOfSaleNumber, fortnightStart }) => `${pointOfSaleNumber}:${fortnightStart}`,
      ),
    );

    return codes.flatMap((code) => {
      const fortnight = { start: code.fortnightStart, end: code.fortnightEnd };
      const closesAt = fortnightClosesAt(fortnight);
      return claims
        .filter(
          ({ pointOfSaleNumber, claimedAt }) =>
            claimedAt < closesAt && !isAccepted.has(`${pointOfSaleNumber}:${fortnight.start}`),
        )
        .map(({ pointOfSaleNumber, registerId }) => ({
          pointOfSaleNumber,
          registerId,
          code: { code: code.code, fortnight, reportDeadline: code.reportDeadline },
        }));
    });
  }

  async holdReport<TOutcome>(
    key: FortnightReportKey,
    work: (report: HeldFortnightReport) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const lock = sql`hashtextextended(${fortnightReportLockKey(key)}, 0)`;
    await this.db.execute(sql`select pg_advisory_lock(${lock})`);
    try {
      return await work(new DrizzleHeldFortnightReport(this.db, key));
    } finally {
      await this.db.execute(sql`select pg_advisory_unlock(${lock})`);
    }
  }
}
