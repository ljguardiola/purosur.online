import { awaitsRemedy } from "@purosur/domain";
import type {
  RejectedFortnightDocument,
  RejectedFortnightDocumentReader,
} from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fortnightDocumentReports, pointOfSaleClaims } from "../platform/db/schema.js";
import { recordedRemedies, remedyKey } from "./drizzle-rejected-document-remedies.js";

export class DrizzleRejectedFortnightDocumentReader<TQueryResult extends PgQueryResultHKT>
  implements RejectedFortnightDocumentReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async presentationsAwaitingRemedy(): Promise<RejectedFortnightDocument[]> {
    const refused = await this.db
      .select({
        pointOfSaleNumber: fortnightDocumentReports.pointOfSaleNumber,
        registerId: pointOfSaleClaims.registerId,
        fortnightStart: fortnightDocumentReports.fortnightStart,
        fortnightEnd: fortnightDocumentReports.fortnightEnd,
        documentType: fortnightDocumentReports.documentType,
        state: fortnightDocumentReports.state,
        rejectedNumber: fortnightDocumentReports.rejectedNumber,
        lastAttemptAt: fortnightDocumentReports.lastAttemptAt,
      })
      .from(fortnightDocumentReports)
      .innerJoin(
        pointOfSaleClaims,
        eq(pointOfSaleClaims.pointOfSaleNumber, fortnightDocumentReports.pointOfSaleNumber),
      )
      .where(eq(fortnightDocumentReports.state, "refused"));
    const { latest } = await recordedRemedies(this.db, {
      pointsOfSale: [...new Set(refused.map(({ pointOfSaleNumber }) => pointOfSaleNumber))],
    });
    return refused.flatMap(
      ({ rejectedNumber, fortnightStart, fortnightEnd, documentType, ...rejection }) =>
        rejectedNumber !== null &&
        awaitsRemedy(
          { ...rejection, rejectedNumber },
          latest.get(
            remedyKey(rejection.pointOfSaleNumber, fortnightStart, documentType, rejectedNumber),
          ) ?? null,
        )
          ? [
              {
                pointOfSaleNumber: rejection.pointOfSaleNumber,
                registerId: rejection.registerId,
                fortnight: { start: fortnightStart, end: fortnightEnd },
                documentType,
                rejectedNumber,
              },
            ]
          : [],
    );
  }
}
