import type { Clock } from "../../shared/index.js";
import type {
  ContingencyBackupOperation,
  ContingencyBackupPrintFailureReason,
  ContingencyBackupTicketRecord,
  OperationEventRange,
} from "../model/contingency-backup-ticket.js";

export interface NewContingencyBackupTicket {
  id: string;
  operation: ContingencyBackupOperation;
  subjectId: string | null;
  range: OperationEventRange;
  createdAt: Date;
  sealed: { keyVersion: number; qrCodes: string[] } | null;
}

export type ContingencyBackupTicketSealing =
  | { kind: "sealed"; keyVersion: number; qrCodes: string[] }
  | { kind: "no_key" };

export interface ContingencyBackupTicketSealer {
  seal(ticketId: string, range: OperationEventRange): Promise<ContingencyBackupTicketSealing>;
}

export type ContingencyBackupTicketPrinting =
  | { kind: "sent" }
  | { kind: "not_sent"; reason: ContingencyBackupPrintFailureReason }
  | { kind: "unrenderable" };

export interface ContingencyBackupTicketPrinter {
  print(ticketId: string): Promise<ContingencyBackupTicketPrinting>;
}

export interface ContingencyBackupTicketIds {
  next(): string;
}

export interface ContingencyBackupTicketStore<TTransaction> {
  transaction<TOutcome>(work: (tx: TTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface ContingencyBackupTicketReads {
  ticketsToConsider(): Promise<ContingencyBackupTicketRecord[]>;
  acknowledgedThroughSeq(): Promise<number>;
}

export interface RecordContingencyBackupTicketTransaction {
  recordTicket(ticket: NewContingencyBackupTicket): Promise<void>;
}

export interface PrintContingencyBackupTicketTransaction extends ContingencyBackupTicketReads {
  markPrinted(ticketId: string, at: Date): Promise<void>;
}

export interface DiscardContingencyBackupTicketsTransaction extends ContingencyBackupTicketReads {
  markDiscarded(ticketIds: readonly string[], at: Date): Promise<void>;
}

export interface RecordContingencyBackupTicketPorts {
  ids: ContingencyBackupTicketIds;
  clock: Clock;
  sealer: ContingencyBackupTicketSealer;
  store: ContingencyBackupTicketStore<RecordContingencyBackupTicketTransaction>;
}

export interface PrintNextContingencyBackupTicketPorts {
  clock: Clock;
  printer: ContingencyBackupTicketPrinter;
  store: ContingencyBackupTicketStore<PrintContingencyBackupTicketTransaction>;
}

export interface DiscardContingencyBackupTicketsPorts {
  clock: Clock;
  store: ContingencyBackupTicketStore<DiscardContingencyBackupTicketsTransaction>;
}
