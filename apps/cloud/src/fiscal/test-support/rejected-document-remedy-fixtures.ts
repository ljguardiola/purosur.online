import type { FiscalTaskDocumentType, OfflineDocumentCorrection } from "@purosur/domain";
import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { rejectedDocumentRemedies } from "../../platform/db/schema.js";
import { fixedZoneRulesSource } from "../../test-support/fixed-zone-rules-source.js";

export async function insertRejectedDocumentRemedy<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    pointOfSale,
    fortnight,
    number,
    correction,
    rejectedAt = null,
    recordedAt,
    documentType = "factura_c",
  }: {
    pointOfSale: number;
    fortnight: Fortnight;
    number: number;
    correction: OfflineDocumentCorrection | null;
    rejectedAt?: Date | null;
    recordedAt: Date;
    documentType?: FiscalTaskDocumentType;
  },
): Promise<void> {
  await db.insert(rejectedDocumentRemedies).values({
    pointOfSaleNumber: pointOfSale,
    fortnightStart: fortnight.start,
    documentType,
    number,
    kind: correction === null ? "report" : "printed",
    correction,
    rejectedAt,
    recordedAt,
  });
}

export const WITHOUT_CREDIT_NOTES = {
  enqueueCreditNote: async () => {},
  now: () => new Date("2026-10-16T12:00:00.000Z"),
  zoneRules: fixedZoneRulesSource(),
};
