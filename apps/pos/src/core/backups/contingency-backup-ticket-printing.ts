import type { ContingencyBackupPrintFailureReason, ZoneRulesSource } from "@purosur/domain";
import type {
  ContingencyBackupTicketPrinter,
  ContingencyBackupTicketPrinting,
  PrintNextContingencyBackupTicketOutcome,
} from "@purosur/domain/backups/use-cases";
import type { ReceiptPrinters } from "@purosur/domain/sales/use-cases";
import {
  type ContingencyBackupTicketPrintout,
  renderContingencyBackupTicket,
} from "./escpos-contingency-backup-ticket";

type WaitingStatus = Extract<
  ContingencyBackupPrintFailureReason,
  "cover_open" | "paper_out" | "not_responding"
>;

export interface ContingencyBackupTicketPrinterDeps {
  printoutOf: (ticketId: string) => ContingencyBackupTicketPrintout | undefined;
  printers: ReceiptPrinters;
  zoneRules: ZoneRulesSource;
  reportFailure: (context: string, error: unknown) => void;
}

export interface ContingencyBackupTicketPrinterWithStanding {
  printer: ContingencyBackupTicketPrinter;
  printerFailure: () => ContingencyBackupPrintFailureReason | null;
}

function isWaitingStatus(status: string): status is WaitingStatus {
  return status === "cover_open" || status === "paper_out" || status === "not_responding";
}

export function createContingencyBackupTicketPrinter({
  printoutOf,
  printers,
  zoneRules,
  reportFailure,
}: ContingencyBackupTicketPrinterDeps): ContingencyBackupTicketPrinterWithStanding {
  let failure: ContingencyBackupPrintFailureReason | null = null;

  function notSent(reason: ContingencyBackupPrintFailureReason): ContingencyBackupTicketPrinting {
    failure = reason;
    return { kind: "not_sent", reason };
  }

  return {
    printerFailure: () => failure,
    printer: {
      async print(ticketId) {
        try {
          const printout = printoutOf(ticketId);
          if (printout === undefined) {
            reportFailure(
              "printing a contingency backup ticket",
              new Error(`the contingency backup ticket ${ticketId} cannot be rendered`),
            );
            return { kind: "unrenderable" };
          }
          const device = printers.configured();
          if (device === undefined) return notSent("printer_not_configured");
          const ending = await device.print(
            {
              signal: new AbortController().signal,
              onStatus: (status) => {
                failure = isWaitingStatus(status) ? status : null;
              },
            },
            () => renderContingencyBackupTicket(printout, zoneRules.zoneRules()),
          );
          if (ending.kind === "abandoned") return notSent("failed");
          failure = null;
          return { kind: "sent" };
        } catch (error) {
          reportFailure("printing a contingency backup ticket", error);
          return notSent("failed");
        }
      },
    },
  };
}

export interface ContingencyBackupTicketWorkerDeps {
  printNext: () => Promise<PrintNextContingencyBackupTicketOutcome>;
  scheduleNext: (run: () => void, delayMs: number) => () => void;
  reportFailure: (context: string, error: unknown) => void;
  intervalMs: number;
}

export interface ContingencyBackupTicketWorker {
  kick(): Promise<void>;
  start(): void;
}

export function createContingencyBackupTicketWorker({
  printNext,
  scheduleNext,
  reportFailure,
  intervalMs,
}: ContingencyBackupTicketWorkerDeps): ContingencyBackupTicketWorker {
  let draining: Promise<void> | undefined;
  let again = false;

  async function pass(): Promise<void> {
    for (;;) {
      try {
        const outcome = await printNext();
        if (outcome.kind !== "printed") return;
      } catch (error) {
        reportFailure("printing a contingency backup ticket", error);
        return;
      }
    }
  }

  async function drain(): Promise<void> {
    do {
      again = false;
      await pass();
    } while (again);
    draining = undefined;
  }

  function kick(): Promise<void> {
    if (draining !== undefined) {
      again = true;
      return draining;
    }
    draining = drain();
    return draining;
  }

  function tick(): void {
    scheduleNext(tick, intervalMs);
    void kick();
  }

  function start(): void {
    scheduleNext(tick, intervalMs);
  }

  return { kick, start };
}
