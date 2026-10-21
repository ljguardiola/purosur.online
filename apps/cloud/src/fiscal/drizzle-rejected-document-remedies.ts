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

export interface RecordedRemedies {
  corrections: Map<string, OfflineDocumentCorrection>;
  latest: Map<string, RecordedRemedy>;
}

export async function recordedRemedies<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { pointsOfSale, fortnightStart }: { pointsOfSale: number[]; fortnightStart?: string },
): Promise<RecordedRemedies> {
  const recorded: RecordedRemedies = { corrections: new Map(), latest: new Map() };
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
      recordedAt: rejectedDocumentRemedies.recordedAt,
    })
    .from(rejectedDocumentRemedies)
    .where(and(inArray(rejectedDocumentRemedies.pointOfSaleNumber, pointsOfSale), ...ofFortnight))
    .orderBy(asc(rejectedDocumentRemedies.recordedAt), asc(rejectedDocumentRemedies.id));
  for (const row of rows) {
    const key = remedyKey(row.pointOfSale, row.fortnightStart, row.documentType, row.number);
    recorded.latest.set(key, { number: row.number, recordedAt: row.recordedAt });
    if (row.correction !== null) {
      recorded.corrections.set(key, row.correction);
    }
  }
  return recorded;
}
