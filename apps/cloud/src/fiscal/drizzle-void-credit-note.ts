import { CREDIT_NOTE_C_DOCUMENT_TYPE } from "@purosur/domain";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { creditNotes, offlineFiscalDocuments } from "../platform/db/schema.js";

export async function voidCreditNoteOfSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  saleId: string,
): Promise<string | null> {
  const [requested] = await db
    .select({ id: creditNotes.id })
    .from(creditNotes)
    .where(and(eq(creditNotes.saleId, saleId), eq(creditNotes.reason, "sale_void")));
  if (requested !== undefined) {
    return requested.id;
  }
  const [issuedOffline] = await db
    .select({ creditNoteId: offlineFiscalDocuments.creditNoteId })
    .from(offlineFiscalDocuments)
    .where(
      and(
        eq(offlineFiscalDocuments.saleId, saleId),
        eq(offlineFiscalDocuments.documentType, CREDIT_NOTE_C_DOCUMENT_TYPE),
      ),
    );
  return issuedOffline?.creditNoteId ?? null;
}
