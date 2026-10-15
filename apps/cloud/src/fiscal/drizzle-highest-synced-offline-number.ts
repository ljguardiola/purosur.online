import type { FiscalDocumentType } from "@purosur/domain";
import { and, eq, isNull, max } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { inbox, offlineFiscalDocuments } from "../platform/db/schema.js";
import { syncedEventUpcaster } from "../sync/synced-event-upcaster.js";
import { unappliedEventColumns } from "../sync/unapplied-event-columns.js";

const OFFLINE_DOCUMENT_EVENT_TYPE = "offline_fiscal_document_issued";

export async function highestSyncedOfflineNumber<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  pointOfSaleNumber: number,
  documentType: FiscalDocumentType,
): Promise<number | null> {
  const [recorded] = await db
    .select({ highest: max(offlineFiscalDocuments.number) })
    .from(offlineFiscalDocuments)
    .where(
      and(
        eq(offlineFiscalDocuments.pointOfSale, pointOfSaleNumber),
        eq(offlineFiscalDocuments.documentType, documentType),
      ),
    );
  const received = await db
    .select(unappliedEventColumns)
    .from(inbox)
    .where(and(eq(inbox.eventType, OFFLINE_DOCUMENT_EVENT_TYPE), isNull(inbox.appliedAt)));
  const numbers: number[] =
    recorded?.highest === null || recorded === undefined ? [] : [recorded.highest];
  for (const event of received) {
    const decoded = syncedEventUpcaster.decode(event);
    if (
      decoded.kind === "fact" &&
      decoded.fact.kind === "offline_fiscal_document_issued" &&
      decoded.fact.document.pointOfSale === pointOfSaleNumber &&
      decoded.fact.document.documentType === documentType
    ) {
      numbers.push(decoded.fact.document.number);
    }
  }
  return numbers.length === 0 ? null : Math.max(...numbers);
}
