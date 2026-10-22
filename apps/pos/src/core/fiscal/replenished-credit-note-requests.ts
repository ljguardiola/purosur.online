import type { PushedEvent, SaleVoidCreditNote } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import { insertPendingCreditNote, readCreditNoteOfSale } from "./sqlite-void-credit-notes";

export function holdReplenishedCreditNoteToRequest(
  database: LocalDatabase,
  creditNote: SaleVoidCreditNote,
  event: PushedEvent,
): void {
  const held = readCreditNoteOfSale(database, creditNote.saleId);
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
       WHERE EXISTS (SELECT 1 FROM sale_void_credit_notes WHERE id = @credit_note_id)`,
    )
    .run({
      credit_note_id: creditNote.creditNoteId,
      event_id: event.event_id,
      device_seq: event.device_seq,
      aggregate_type: event.aggregate_type,
      aggregate_id: event.aggregate_id,
      event_type: event.event_type,
      schema_version: event.schema_version,
      payload: JSON.stringify(event.payload),
      occurred_at: event.occurred_at,
      actor_id: event.actor_id,
      chain_hmac: event.chain_hmac,
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
