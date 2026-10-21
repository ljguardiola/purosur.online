import type { Fortnight, OfflineDocumentCorrection } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { rejectedDocumentRemedies } from "../../platform/db/schema.js";

export async function insertRejectedDocumentRemedy<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    pointOfSale,
    fortnight,
    number,
    correction,
    recordedAt,
  }: {
    pointOfSale: number;
    fortnight: Fortnight;
    number: number;
    correction: OfflineDocumentCorrection | null;
    recordedAt: Date;
  },
): Promise<void> {
  await db.insert(rejectedDocumentRemedies).values({
    pointOfSaleNumber: pointOfSale,
    fortnightStart: fortnight.start,
    documentType: "factura_c",
    number,
    kind: correction === null ? "report" : "printed",
    correction,
    recordedAt,
  });
}

export const WITHOUT_CREDIT_NOTES = {
  enqueueCreditNote: async () => {},
  now: () => new Date("2026-10-16T12:00:00.000Z"),
};
