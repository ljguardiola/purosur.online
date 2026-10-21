import type { Fortnight, RecordedDocumentTypeReport } from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fortnightDocumentReports, pointOfSaleClaims, registers } from "../platform/db/schema.js";
import { recordedRemedies, remedyKey } from "./drizzle-rejected-document-remedies.js";

export async function recordedDocumentTypeReports<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  pointOfSaleNumber: number,
  fortnight: Fortnight,
  locationId?: string,
): Promise<RecordedDocumentTypeReport[]> {
  const rows = await db
    .select({
      documentType: fortnightDocumentReports.documentType,
      state: fortnightDocumentReports.state,
      reportedThrough: fortnightDocumentReports.reportedThrough,
      rejectedNumber: fortnightDocumentReports.rejectedNumber,
      lastAttemptAt: fortnightDocumentReports.lastAttemptAt,
      rejections: fortnightDocumentReports.rejections,
    })
    .from(fortnightDocumentReports)
    .innerJoin(
      pointOfSaleClaims,
      eq(pointOfSaleClaims.pointOfSaleNumber, fortnightDocumentReports.pointOfSaleNumber),
    )
    .innerJoin(registers, eq(registers.id, pointOfSaleClaims.registerId))
    .where(
      and(
        eq(fortnightDocumentReports.pointOfSaleNumber, pointOfSaleNumber),
        eq(fortnightDocumentReports.fortnightStart, fortnight.start),
        ...(locationId === undefined ? [] : [eq(registers.locationId, locationId)]),
      ),
    );
  if (rows.length === 0) {
    return [];
  }
  const { latest } = await recordedRemedies(db, {
    pointsOfSale: [pointOfSaleNumber],
    fortnightStart: fortnight.start,
  });
  return rows.map(({ rejections, ...row }) => ({
    ...row,
    rejections: rejections ?? [],
    remedy:
      row.rejectedNumber === null
        ? null
        : (latest.get(
            remedyKey(pointOfSaleNumber, fortnight.start, row.documentType, row.rejectedNumber),
          ) ?? null),
  }));
}
