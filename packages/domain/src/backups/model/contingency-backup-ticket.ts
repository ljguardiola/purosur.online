import { type FiscalEmissionMode, isConnectivityGap } from "../../fiscal/index.js";

export const CONTINGENCY_BACKUP_OPERATIONS = [
  "sale",
  "paid_sale_cancellation",
  "sale_void",
  "cash_movement",
  "cash_session_opening",
  "cash_session_closing",
  "initial_count",
  "clock_correction",
  "reprint",
] as const;

export type ContingencyBackupOperation = (typeof CONTINGENCY_BACKUP_OPERATIONS)[number];

export const CONTINGENCY_BACKUP_PRINT_FAILURE_REASONS = [
  "cover_open",
  "paper_out",
  "not_responding",
  "printer_not_configured",
  "failed",
] as const;

export type ContingencyBackupPrintFailureReason =
  (typeof CONTINGENCY_BACKUP_PRINT_FAILURE_REASONS)[number];

export const CONTINGENCY_BACKUP_TICKET_STANDINGS = [
  "discarded",
  "discardable",
  "kept",
  "no_longer_needed",
  "missing_key",
  "awaiting_customer_document",
  "to_print",
] as const;

export type ContingencyBackupTicketStanding = (typeof CONTINGENCY_BACKUP_TICKET_STANDINGS)[number];

export interface OperationEventRange {
  firstDeviceSeq: number;
  lastDeviceSeq: number;
}

export interface ContingencyBackupTicketRecord {
  id: string;
  lastDeviceSeq: number;
  sealed: boolean;
  customerDocumentPrinted: boolean | null;
  printedAt: Date | null;
  discardedAt: Date | null;
}

export interface ContingencyBackupTicketsSummary {
  toPrint: number;
  awaitingCustomerDocument: number;
  missingKey: number;
  kept: number;
  discardable: number;
  mayDiscard: boolean;
}

export function needsContingencyBackupTicket({
  modesAround,
  range,
}: {
  modesAround: readonly FiscalEmissionMode[];
  range: OperationEventRange;
}): boolean {
  return range.lastDeviceSeq >= range.firstDeviceSeq && modesAround.some(isConnectivityGap);
}

export function contingencyBackupTicketStanding(
  ticket: ContingencyBackupTicketRecord,
  acknowledgedThroughSeq: number,
): ContingencyBackupTicketStanding {
  const synced = ticket.lastDeviceSeq <= acknowledgedThroughSeq;
  if (ticket.discardedAt !== null) return "discarded";
  if (ticket.printedAt !== null) return synced ? "discardable" : "kept";
  if (synced) return "no_longer_needed";
  if (!ticket.sealed) return "missing_key";
  if (ticket.customerDocumentPrinted === false) return "awaiting_customer_document";
  return "to_print";
}

export function contingencyBackupTicketsSummary(
  tickets: readonly ContingencyBackupTicketRecord[],
  acknowledgedThroughSeq: number,
): ContingencyBackupTicketsSummary {
  const counts: Record<ContingencyBackupTicketStanding, number> = {
    discarded: 0,
    discardable: 0,
    kept: 0,
    no_longer_needed: 0,
    missing_key: 0,
    awaiting_customer_document: 0,
    to_print: 0,
  };
  for (const ticket of tickets) {
    counts[contingencyBackupTicketStanding(ticket, acknowledgedThroughSeq)] += 1;
  }
  const pending =
    counts.to_print + counts.awaiting_customer_document + counts.missing_key + counts.kept;
  return {
    toPrint: counts.to_print,
    awaitingCustomerDocument: counts.awaiting_customer_document,
    missingKey: counts.missing_key,
    kept: counts.kept,
    discardable: counts.discardable,
    mayDiscard: counts.discardable > 0 && pending === 0,
  };
}
