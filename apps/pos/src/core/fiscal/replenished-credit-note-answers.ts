import type { CreditNoteToIssue, RestoredCreditNoteAnswer } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import {
  insertPendingCreditNote,
  readCreditNoteById,
  writeCreditNoteAnswer,
} from "./sqlite-void-credit-notes";

export function recordReplenishedCreditNoteAnswer(
  database: LocalDatabase,
  creditNote: CreditNoteToIssue,
  { answer, answeredAt }: RestoredCreditNoteAnswer,
): void {
  if (answer.kind === "issued_offline") {
    return;
  }
  const held = readCreditNoteById(database, creditNote.creditNoteId);
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
