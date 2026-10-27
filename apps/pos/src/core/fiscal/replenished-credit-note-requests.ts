import type { CreditNoteToIssue, PushedEvent } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import { insertPendingCreditNote, readCreditNoteById } from "./sqlite-sale-credit-notes";

export function holdReplenishedCreditNoteToRequest(
  database: LocalDatabase,
  creditNote: CreditNoteToIssue,
  event: PushedEvent,
): void {
  const held = readCreditNoteById(database, creditNote.creditNoteId);
  if (held !== null && held.answer.kind !== "in_progress") {
    return;
  }
  if (held === null) {
    insertPendingCreditNote(database, creditNote);
  }
  const changes = database
    .prepare(
      `INSERT OR IGNORE INTO replenished_credit_note_requests (
         credit_note_id, event_id, device_seq, aggregate_type, aggregate_id, event_type,
         schema_version, payload, occurred_at, actor_id, chain_hmac
       )
       SELECT @credit_note_id, @event_id, @device_seq, @aggregate_type, @aggregate_id,
              @event_type, @schema_version, @payload, @occurred_at, @actor_id, @chain_hmac
       WHERE EXISTS (SELECT 1 FROM sale_credit_notes WHERE id = @credit_note_id)`,
    )
    .run({
      ...event,
      credit_note_id: creditNote.creditNoteId,
      payload: JSON.stringify(event.payload),
    }).changes;
  if (changes === 0 && !holdsRequest(database, creditNote.creditNoteId)) {
    throw new Error(`the register holds no credit note ${creditNote.creditNoteId}`);
  }
}

function holdsRequest(database: LocalDatabase, creditNoteId: string): boolean {
  return (
    database
      .prepare("SELECT 1 FROM replenished_credit_note_requests WHERE credit_note_id = ?")
      .get(creditNoteId) !== undefined
  );
}
