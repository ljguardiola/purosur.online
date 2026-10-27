import {
  CREDIT_NOTE_C_DOCUMENT_TYPE,
  type CreditNoteToIssue,
  type OfflineCreditNote,
} from "@purosur/domain";
import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import type { ReturnTransaction } from "@purosur/domain/returns/use-cases";
import { readFiscalOnlineEvidence } from "../fiscal/sqlite-fiscal-online-evidence";
import { readOfflineAuthorizationCodeOf, readOfflineSeries } from "../fiscal/sqlite-fiscal-series";
import { insertOfflineCreditNote, upsertClockMark } from "../fiscal/sqlite-sale-authorization";
import {
  insertCreditNoteIssuedOffline,
  insertPendingCreditNote,
  readSaleInvoiceStanding,
} from "../fiscal/sqlite-sale-credit-notes";
import type { LocalDatabase } from "../platform/local-database";

type ReturnCreditNotePorts = Pick<
  ReturnTransaction,
  | "saleInvoiceStanding"
  | "fiscalOnlineEvidence"
  | "offlineCreditNoteSeries"
  | "offlineAuthorizationCodeOf"
  | "recordPendingCreditNote"
  | "issueOfflineCreditNote"
  | "recordClockMark"
>;

function latestReturnOfSale(database: LocalDatabase, saleId: string): string {
  const latest = database
    .prepare<[string], { id: string }>(
      "SELECT id FROM returns WHERE sale_id = ? ORDER BY rowid DESC LIMIT 1",
    )
    .get(saleId);
  if (latest === undefined) {
    throw new Error(`sale ${saleId} has no return to credit`);
  }
  return latest.id;
}

export function returnCreditNotePorts(database: LocalDatabase): ReturnCreditNotePorts {
  return {
    saleInvoiceStanding: (saleId) => readSaleInvoiceStanding(database, saleId),
    fiscalOnlineEvidence: () => readFiscalOnlineEvidence(database),
    offlineCreditNoteSeries: () => readOfflineSeries(database, CREDIT_NOTE_C_DOCUMENT_TYPE),
    offlineAuthorizationCodeOf: (fortnight: Fortnight) =>
      readOfflineAuthorizationCodeOf(database, fortnight),
    recordPendingCreditNote: (creditNote: CreditNoteToIssue) =>
      insertPendingCreditNote(database, creditNote),
    issueOfflineCreditNote: (document: OfflineCreditNote) => {
      insertOfflineCreditNote(database, document);
      const returnId = latestReturnOfSale(database, document.saleId);
      insertCreditNoteIssuedOffline(
        database,
        document,
        returnId === null ? null : { returnId, issuedOn: document.issuedOn },
      );
    },
    recordClockMark: (mark) => upsertClockMark(database, mark),
  };
}
