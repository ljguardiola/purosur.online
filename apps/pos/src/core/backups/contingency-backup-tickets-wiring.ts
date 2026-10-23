import type { FiscalEmissionMode } from "@purosur/domain";
import {
  printNextContingencyBackupTicket,
  recordContingencyBackupTicket,
} from "@purosur/domain/backups/use-cases";
import type { ReceiptPrinters } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate } from "../sessions/action-gate";
import { SqliteLocalOutbox } from "../sync/sqlite-local-outbox";
import {
  type ContingencyBackupTicketWorker,
  createContingencyBackupTicketPrinter,
  createContingencyBackupTicketWorker,
} from "./contingency-backup-ticket-printing";
import {
  type ContingencyBackupTicketRequests,
  createContingencyBackupTicketRequests,
} from "./contingency-backup-ticket-requests";
import { createContingencyBackupTicketSealer } from "./contingency-backup-ticket-sealing";
import { readContingencyBackupTicketPrintout } from "./sqlite-contingency-backup-ticket-printout";
import { SqliteContingencyBackupTickets } from "./sqlite-contingency-backup-tickets";
import { createTicketedOperations, type TicketedOperations } from "./ticketed-operation";

export interface ContingencyBackupTicketsDeps {
  database: LocalDatabase;
  now: () => Date;
  ids: { next: () => string };
  readContingencyTicketKey: () => Promise<{ version: number; key: string } | undefined>;
  appVersion: string | undefined;
  readEmissionMode: () => FiscalEmissionMode;
  printers: ReceiptPrinters;
  scheduleNext: (run: () => void, delayMs: number) => () => void;
  intervalMs: number;
  reportFailure: (context: string, error: unknown) => void;
  signedInUserId: () => string | undefined;
  gate: Pick<ActionGate, "run">;
}

export interface ContingencyBackupTickets {
  ticketed: TicketedOperations["ticketed"];
  requests: ContingencyBackupTicketRequests;
  worker: ContingencyBackupTicketWorker;
}

export function createContingencyBackupTickets({
  database,
  now,
  ids,
  readContingencyTicketKey,
  appVersion,
  readEmissionMode,
  printers,
  scheduleNext,
  intervalMs,
  reportFailure,
  signedInUserId,
  gate,
}: ContingencyBackupTicketsDeps): ContingencyBackupTickets {
  const clock = { now };
  const store = new SqliteContingencyBackupTickets(database);
  const sealer = createContingencyBackupTicketSealer({
    database,
    outbox: new SqliteLocalOutbox(database, now),
    readContingencyTicketKey,
    appVersion,
  });
  const printing = createContingencyBackupTicketPrinter({
    printoutOf: (ticketId) => readContingencyBackupTicketPrintout(database, ticketId),
    printers,
    reportFailure,
  });
  const worker = createContingencyBackupTicketWorker({
    printNext: () => printNextContingencyBackupTicket({ clock, printer: printing.printer, store }),
    scheduleNext,
    reportFailure,
    intervalMs,
  });
  const { ticketed } = createTicketedOperations({
    readLastDeviceSeq: () =>
      database
        .prepare<[], { last_device_seq: number }>("SELECT last_device_seq FROM sync_state")
        .get()?.last_device_seq ?? 0,
    readEmissionMode,
    record: (input) => recordContingencyBackupTicket({ ids, clock, sealer, store }, input),
    afterRecorded: () => void worker.kick(),
    reportFailure,
  });
  return {
    ticketed,
    requests: createContingencyBackupTicketRequests({
      tickets: store,
      clock,
      printerFailure: printing.printerFailure,
      signedInUserId,
      gate,
    }),
    worker,
  };
}
