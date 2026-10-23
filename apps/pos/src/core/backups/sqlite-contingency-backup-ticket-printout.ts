import { CASH_MOVEMENT_KINDS, type CashMovementKind } from "@purosur/domain";
import { readSaleFiscalDocument } from "../fiscal/sqlite-sale-fiscal-document";
import { readCreditNoteOfSale } from "../fiscal/sqlite-void-credit-notes";
import type { LocalDatabase } from "../platform/local-database";
import type {
  BackedDocument,
  ContingencyBackupTicketPrintout,
  PrintedOperation,
} from "./escpos-contingency-backup-ticket";

interface TicketRow {
  operation: string;
  first_device_seq: number;
  last_device_seq: number;
  subject_id: string | null;
  created_at: string;
  qr_codes: string | null;
}

function isCashMovementKind(value: unknown): value is CashMovementKind {
  return CASH_MOVEMENT_KINDS.some((kind) => kind === value);
}

function movementOf(database: LocalDatabase, ticket: TicketRow): CashMovementKind | null {
  const event = database
    .prepare<[number, number], { payload: string }>(
      `SELECT payload FROM outbox
        WHERE device_id = (SELECT device_id FROM sync_state)
          AND event_type = 'cash_movement_recorded' AND device_seq BETWEEN ? AND ?
        ORDER BY device_seq LIMIT 1`,
    )
    .get(ticket.first_device_seq, ticket.last_device_seq);
  if (event === undefined) return null;
  const { type } = JSON.parse(event.payload) as { type?: unknown };
  return isCashMovementKind(type) ? type : null;
}

function operationNumberOf(database: LocalDatabase, saleId: string | null): number | undefined {
  if (saleId === null) return undefined;
  return (
    database
      .prepare<[string], { operation_number: number | null }>(
        "SELECT operation_number FROM sales WHERE id = ?",
      )
      .get(saleId)?.operation_number ?? undefined
  );
}

function operationOf(database: LocalDatabase, ticket: TicketRow): PrintedOperation | undefined {
  switch (ticket.operation) {
    case "sale":
    case "paid_sale_cancellation":
    case "sale_void":
    case "reprint": {
      const operationNumber = operationNumberOf(database, ticket.subject_id);
      return operationNumber === undefined ? undefined : { kind: "numbered", operationNumber };
    }
    case "cash_movement":
      return { kind: "cash_movement", movement: movementOf(database, ticket) };
    case "cash_session_opening":
    case "cash_session_closing":
    case "initial_count":
    case "clock_correction":
      return { kind: ticket.operation };
    default:
      return undefined;
  }
}

function saleDocument(database: LocalDatabase, saleId: string): BackedDocument | null {
  const document = readSaleFiscalDocument(database, saleId);
  switch (document.kind) {
    case "authorized":
    case "offline_authorized":
      return {
        kind: "invoice",
        pointOfSale: document.authorized.pointOfSale,
        number: document.authorized.number,
      };
    case "deferred":
      return { kind: "deferred_sale_document", shortCode: document.deferred.shortCode };
    default:
      return null;
  }
}

function creditNote(database: LocalDatabase, saleId: string): BackedDocument | null {
  const answer = readCreditNoteOfSale(database, saleId)?.answer;
  return answer?.kind === "authorized"
    ? { kind: "credit_note", pointOfSale: answer.pointOfSale, number: answer.number }
    : null;
}

function backedDocumentOf(database: LocalDatabase, ticket: TicketRow): BackedDocument | null {
  if (ticket.subject_id === null) return null;
  if (ticket.operation === "sale") return saleDocument(database, ticket.subject_id);
  if (ticket.operation === "sale_void") return creditNote(database, ticket.subject_id);
  return null;
}

export function readContingencyBackupTicketPrintout(
  database: LocalDatabase,
  ticketId: string,
): ContingencyBackupTicketPrintout | undefined {
  const ticket = database
    .prepare<[string], TicketRow>(
      `SELECT operation, first_device_seq, last_device_seq, subject_id, created_at, qr_codes
         FROM contingency_backup_tickets WHERE id = ?`,
    )
    .get(ticketId);
  const branch = database
    .prepare<[], { address: string }>(
      "SELECT address FROM branch_settings ORDER BY location_id LIMIT 1",
    )
    .get();
  const register = database
    .prepare<[], { name: string }>("SELECT name FROM own_register WHERE removed = 0")
    .get();
  if (ticket?.qr_codes == null || branch === undefined || register === undefined) return undefined;
  const operation = operationOf(database, ticket);
  if (operation === undefined) return undefined;
  return {
    createdAt: new Date(ticket.created_at),
    branchAddress: branch.address,
    registerName: register.name,
    operation,
    backs: backedDocumentOf(database, ticket),
    qrCodes: JSON.parse(ticket.qr_codes) as string[],
  };
}
