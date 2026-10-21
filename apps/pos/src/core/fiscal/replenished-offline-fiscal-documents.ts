import { raisedClockMark } from "@purosur/domain";
import type { ReplenishedEventApplication, SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import {
  clockMarkOf,
  insertOfflineFiscalDocument,
  upsertClockMark,
} from "./sqlite-sale-authorization";

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
  const { invoice } = document;
  if (invoice === undefined) {
    return "not_yet_applicable";
  }
  if (database.prepare("SELECT 1 FROM sales WHERE id = ?").get(document.saleId) === undefined) {
    throw new Error(`sale ${document.saleId} is not held`);
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
