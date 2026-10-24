import { raisedClockMark } from "@purosur/domain";
import type { ReplenishedEventApplication, SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { clockMarkOf } from "./sqlite-fiscal-series";
import {
  insertOfflineCreditNote,
  insertOfflineFiscalDocument,
  upsertClockMark,
} from "./sqlite-sale-authorization";
import { insertCreditNoteIssuedOffline } from "./sqlite-void-credit-notes";

type OfflineDocumentFact = Extract<SyncedFact, { kind: "offline_fiscal_document_issued" }>;

export function applyReplenishedOfflineFiscalDocument(
  database: LocalDatabase,
  { document }: OfflineDocumentFact,
): ReplenishedEventApplication {
  if (
    database
      .prepare("SELECT 1 FROM offline_fiscal_documents WHERE id = ?")
      .get(document.fiscalDocumentId) !== undefined
  ) {
    return "applied";
  }
  const { invoice, corrects, creditNoteId } = document;
  if (corrects === undefined && invoice === undefined) {
    return "not_yet_applicable";
  }
  if (database.prepare("SELECT 1 FROM sales WHERE id = ?").get(document.saleId) === undefined) {
    throw new Error(`sale ${document.saleId} is not held`);
  }
  if (corrects !== undefined && creditNoteId !== undefined) {
    holdReplenishedCreditNote(database, document, corrects, creditNoteId);
    return "applied";
  }
  if (invoice === undefined) {
    return "not_yet_applicable";
  }
  insertOfflineFiscalDocument(database, {
    id: document.fiscalDocumentId,
    saleId: document.saleId,
    pointOfSale: document.pointOfSale,
    documentType: document.documentType,
    number: document.number,
    issuedOn: document.issuedOn,
    generatedAt: document.generatedAt,
    generationStamp: document.generationStamp,
    offlineAuthorizationCode: document.offlineAuthorizationCode,
    fortnight: { start: document.fortnightStart, end: document.fortnightEnd },
    document: invoice,
    buyerDocumentType: document.buyerDocumentType,
    buyerDocumentNumber: document.buyerDocumentNumber,
    cause: document.cause,
  });
  upsertClockMark(database, {
    pointOfSale: document.pointOfSale,
    documentType: document.documentType,
    reading: raisedClockMark(
      clockMarkOf(database, document.pointOfSale, document.documentType),
      document.generatedAt,
    ),
  });
  return "applied";
}

function holdReplenishedCreditNote(
  database: LocalDatabase,
  document: OfflineDocumentFact["document"],
  corrects: NonNullable<OfflineDocumentFact["document"]["corrects"]>,
  creditNoteId: string,
): void {
  database
    .prepare("DELETE FROM replenished_credit_note_requests WHERE credit_note_id = ?")
    .run(creditNoteId);
  database
    .prepare("DELETE FROM sale_void_credit_notes WHERE id = ? AND state = 'IN_PROGRESS'")
    .run(creditNoteId);
  const note = {
    id: document.fiscalDocumentId,
    saleId: document.saleId,
    creditNoteId,
    pointOfSale: document.pointOfSale,
    documentType: "credit_note_c" as const,
    number: document.number,
    issuedOn: document.issuedOn,
    generatedAt: document.generatedAt,
    generationStamp: document.generationStamp,
    offlineAuthorizationCode: document.offlineAuthorizationCode,
    fortnight: { start: document.fortnightStart, end: document.fortnightEnd },
    total: document.total,
    receiverTaxStatusCode: document.buyerTaxStatusCode,
    corrects,
    buyerDocumentType: document.buyerDocumentType,
    buyerDocumentNumber: document.buyerDocumentNumber,
    cause: document.cause,
  };
  insertOfflineCreditNote(database, note);
  insertCreditNoteIssuedOffline(database, note);
  upsertClockMark(database, {
    pointOfSale: document.pointOfSale,
    documentType: "credit_note_c",
    reading: raisedClockMark(
      clockMarkOf(database, document.pointOfSale, "credit_note_c"),
      document.generatedAt,
    ),
  });
}
