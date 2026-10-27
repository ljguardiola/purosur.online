import type { CreditNoteToIssue, RestoredCreditNoteAnswer } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import {
  insertPendingCreditNote,
  readCreditNoteById,
  writeCreditNoteAnswer,
} from "./sqlite-sale-credit-notes";

export function recordReplenishedCreditNoteAnswer(
  database: LocalDatabase,
  creditNote: CreditNoteToIssue,
  { answer, answeredAt }: RestoredCreditNoteAnswer,
): void {
  const held = readCreditNoteById(database, creditNote.creditNoteId);
  if (held !== null && held.answer.kind !== "in_progress") {
    return;
  }
  if (held === null) {
    insertPendingCreditNote(database, creditNote);
  }
  if (answer.kind === "issued_offline") {
    return;
  }
  const changes = writeCreditNoteAnswer(database, creditNote.creditNoteId, answer, answeredAt);
  if (changes === 0) {
    throw new Error(`the register holds no credit note ${creditNote.creditNoteId}`);
  }
}
