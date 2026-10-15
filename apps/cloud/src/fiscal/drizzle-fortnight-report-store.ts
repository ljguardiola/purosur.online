import { isOfflineDocumentReported } from "@purosur/domain";
import type {
  DocumentTypeReportChange,
  FortnightReportChange,
  FortnightReportKey,
  FortnightReportStore,
  HeldFortnightReport,
  OwedFortnightReport,
  RecordedFortnightReport,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  fortnightDocumentReports,
  fortnightReports,
  offlineFiscalDocuments,
} from "../platform/db/schema.js";
import { fortnightReportsOwedAs, owedFortnightReportsWithState } from "./owed-fortnight-reports.js";

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
      .select({
        state: fortnightReports.state,
        movement: fortnightReports.movement,
        lastAttemptAt: fortnightReports.lastAttemptAt,
      })
      .from(fortnightReports)
      .where(this.rowMatch());
    return row ?? null;
  }

  async record({ state, at, movement, rejections }: FortnightReportChange): Promise<void> {
    const attempt = STATES_THAT_ARE_AN_ATTEMPT.has(state) ? { lastAttemptAt: at } : {};
    const { pointOfSaleNumber, fortnight } = this.key;
    await this.db
      .insert(fortnightReports)
      .values({
        pointOfSaleNumber,
        fortnightStart: fortnight.start,
        fortnightEnd: fortnight.end,
        state,
        movement: movement ?? null,
        rejections: rejections ?? null,
        recordedAt: at,
        ...attempt,
      })
      .onConflictDoUpdate({
        target: [fortnightReports.pointOfSaleNumber, fortnightReports.fortnightStart],
        set: {
          state,
          movement: movement ?? null,
          rejections: rejections ?? null,
          recordedAt: at,
          ...attempt,
        },
      });
  }

  async recordDocumentType({
    documentType,
    state,
    at,
    reportedThrough,
    rejectedNumber,
    rejections,
  }: DocumentTypeReportChange): Promise<void> {
    const attempt = STATES_THAT_ARE_AN_ATTEMPT.has(state) ? { lastAttemptAt: at } : {};
    const { pointOfSaleNumber, fortnight } = this.key;
    const progress = {
      state,
      reportedThrough,
      rejectedNumber: rejectedNumber ?? null,
      rejections: rejections ?? null,
      recordedAt: at,
      ...attempt,
    };
    await this.db
      .insert(fortnightDocumentReports)
      .values({
        pointOfSaleNumber,
        fortnightStart: fortnight.start,
        fortnightEnd: fortnight.end,
        documentType,
        ...progress,
      })
      .onConflictDoUpdate({
        target: [
          fortnightDocumentReports.pointOfSaleNumber,
          fortnightDocumentReports.fortnightStart,
          fortnightDocumentReports.documentType,
        ],
        set: progress,
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
    const owed = await owedFortnightReportsWithState(this.db, today);
    return owed.map(({ owed: report }) => report);
  }

  async acceptedWithUnreportedDocuments(): Promise<OwedFortnightReport[]> {
    const accepted = await this.db
      .select({
        pointOfSaleNumber: fortnightReports.pointOfSaleNumber,
        fortnightStart: fortnightReports.fortnightStart,
      })
      .from(fortnightReports)
      .where(and(eq(fortnightReports.state, "accepted"), isNotNull(fortnightReports.movement)));
    if (accepted.length === 0) {
      return [];
    }
    const documents = await this.db
      .select({
        pointOfSale: offlineFiscalDocuments.pointOfSale,
        fortnightStart: offlineFiscalDocuments.fortnightStart,
        documentType: offlineFiscalDocuments.documentType,
        number: offlineFiscalDocuments.number,
      })
      .from(offlineFiscalDocuments)
      .where(
        inArray(
          offlineFiscalDocuments.fortnightStart,
          accepted.map(({ fortnightStart }) => fortnightStart),
        ),
      );
    const reports = await this.db
      .select({
        pointOfSaleNumber: fortnightDocumentReports.pointOfSaleNumber,
        fortnightStart: fortnightDocumentReports.fortnightStart,
        documentType: fortnightDocumentReports.documentType,
        reportedThrough: fortnightDocumentReports.reportedThrough,
      })
      .from(fortnightDocumentReports);
    const reportedThrough = new Map(
      reports.map((report) => [
        `${report.pointOfSaleNumber}:${report.fortnightStart}:${report.documentType}`,
        report.reportedThrough,
      ]),
    );
    const unreported = new Set(
      documents
        .filter(
          ({ pointOfSale, fortnightStart, documentType, number }) =>
            !isOfflineDocumentReported(
              number,
              reportedThrough.get(`${pointOfSale}:${fortnightStart}:${documentType}`) ?? null,
            ),
        )
        .map(({ pointOfSale, fortnightStart }) => `${pointOfSale}:${fortnightStart}`),
    );
    return fortnightReportsOwedAs(
      this.db,
      accepted.filter(({ pointOfSaleNumber, fortnightStart }) =>
        unreported.has(`${pointOfSaleNumber}:${fortnightStart}`),
      ),
    );
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
