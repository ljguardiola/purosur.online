import type { OfflineDocumentCorrection } from "@purosur/domain";
import type { RecordedRemedy } from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { rejectedDocumentRemedies } from "../platform/db/schema.js";

export function remedyKey(
  pointOfSale: number,
  fortnightStart: string,
  documentType: string,
  number: number,
): string {
  return `${pointOfSale}:${fortnightStart}:${documentType}:${number}`;
}

function rejectionKey(documentKey: string, rejectedAt: Date | null): string {
  return `${documentKey}:${rejectedAt?.toISOString() ?? "never attempted"}`;
}

export interface RemediedRejection {
  pointOfSale: number;
  fortnightStart: string;
  documentType: string;
  rejectedNumber: number | null;
  lastAttemptAt: Date | null;
}

export interface RecordedRemedies {
  corrections: Map<string, OfflineDocumentCorrection>;
  remedyOf(rejection: RemediedRejection): RecordedRemedy | null;
}

export async function recordedRemedies<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { pointsOfSale, fortnightStart }: { pointsOfSale: number[]; fortnightStart?: string },
): Promise<RecordedRemedies> {
  const corrections = new Map<string, OfflineDocumentCorrection>();
  const byRejection = new Map<string, RecordedRemedy>();
  const recorded: RecordedRemedies = {
    corrections,
    remedyOf: ({
      pointOfSale,
      fortnightStart: start,
      documentType,
      rejectedNumber,
      lastAttemptAt,
    }) =>
      rejectedNumber === null
        ? null
        : (byRejection.get(
            rejectionKey(
              remedyKey(pointOfSale, start, documentType, rejectedNumber),
              lastAttemptAt,
            ),
          ) ?? null),
  };
  if (pointsOfSale.length === 0) {
    return recorded;
  }
  const ofFortnight: SQL[] =
    fortnightStart === undefined
      ? []
      : [eq(rejectedDocumentRemedies.fortnightStart, fortnightStart)];
  const rows = await db
    .select({
      pointOfSale: rejectedDocumentRemedies.pointOfSaleNumber,
      fortnightStart: rejectedDocumentRemedies.fortnightStart,
      documentType: rejectedDocumentRemedies.documentType,
      number: rejectedDocumentRemedies.number,
      correction: rejectedDocumentRemedies.correction,
      rejectedAt: rejectedDocumentRemedies.rejectedAt,
    })
    .from(rejectedDocumentRemedies)
    .where(and(inArray(rejectedDocumentRemedies.pointOfSaleNumber, pointsOfSale), ...ofFortnight))
    .orderBy(asc(rejectedDocumentRemedies.recordedAt), asc(rejectedDocumentRemedies.id));
  for (const row of rows) {
    const key = remedyKey(row.pointOfSale, row.fortnightStart, row.documentType, row.number);
    byRejection.set(rejectionKey(key, row.rejectedAt), {
      number: row.number,
      rejectedAt: row.rejectedAt,
    });
    if (row.correction !== null) {
      corrections.set(key, row.correction);
    }
  }
  return recorded;
}
