import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { offlineFiscalDocuments, sales } from "../platform/db/schema.js";
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
  const [sale] = await tx
    .select({ id: sales.id })
    .from(sales)
    .where(and(eq(sales.id, document.saleId), eq(sales.registerId, origin.registerId)));
  if (sale === undefined) {
    throw new Error(`sale ${document.saleId} is not applied for register ${origin.registerId}`);
  }
  const { fiscalDocumentId, ...fields } = document;
  await tx
    .insert(offlineFiscalDocuments)
    .values({ id: fiscalDocumentId, ...fields, recordedAt })
    .onConflictDoNothing({ target: offlineFiscalDocuments.id });
}
