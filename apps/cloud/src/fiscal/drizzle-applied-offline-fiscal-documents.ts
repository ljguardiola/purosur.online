import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { offlineFiscalDocuments } from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";

export async function recordAppliedOfflineFiscalDocument<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  origin: AppliedOrigin,
  { document }: Extract<SyncedFact, { kind: "offline_fiscal_document_issued" }>,
  recordedAt: Date,
): Promise<void> {
  if (document.registerId !== origin.registerId) {
    throw new Error(
      `document ${document.fiscalDocumentId} names register ${document.registerId}, not the register ${origin.registerId} that pushed it`,
    );
  }
  const { fiscalDocumentId, ...fields } = document;
  await tx
    .insert(offlineFiscalDocuments)
    .values({ id: fiscalDocumentId, ...fields, recordedAt })
    .onConflictDoNothing({ target: offlineFiscalDocuments.id });
}
