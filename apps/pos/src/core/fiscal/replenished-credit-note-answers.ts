import type { RestoredCreditNoteAnswer, SaleVoidCreditNote } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import {
  insertPendingCreditNote,
  readCreditNoteOfSale,
  writeCreditNoteAnswer,
} from "./sqlite-void-credit-notes";

export function recordReplenishedCreditNoteAnswer(
  database: LocalDatabase,
  creditNote: SaleVoidCreditNote,
  { answer, answeredAt }: RestoredCreditNoteAnswer,
): void {
  const held = readCreditNoteOfSale(database, creditNote.saleId);
  if (held !== null && held.answer.kind !== "in_progress") {
    return;
  }
  if (held === null) {
    insertPendingCreditNote(database, creditNote);
  }
  const changes = writeCreditNoteAnswer(database, creditNote.creditNoteId, answer, answeredAt);
  if (changes === 0) {
    throw new Error(`the register holds no credit note ${creditNote.creditNoteId}`);
  }
}
