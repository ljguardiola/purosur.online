import {
  mayStartReceiptPrint,
  observePrinterNotConfigured,
  observePrinterStatus,
  observePrintFailed,
  observePrintSent,
  type ReceiptPrintObservation,
  type ReceiptPrintStanding,
  receiptPrintStanding,
  startedReceiptPrint,
} from "@purosur/domain";
import type {
  ReceiptPrinter,
  ReceiptPrinters,
  ReceiptPrintWatch,
} from "@purosur/domain/sales/use-cases";

export interface ReceiptPrintJobsDeps {
  reportFailure: (context: string, error: unknown) => void;
}

interface ReceiptPrintRunner {
  watch: ReceiptPrintWatch;
  printers: (inner: ReceiptPrinters) => ReceiptPrinters;
}

type ReceiptPrintStart<TOutcome> =
  | { kind: "busy" }
  | { kind: "sent" }
  | { kind: "answered"; outcome: TOutcome }
  | { kind: "failed" };

interface ReceiptPrintStartOptions {
  unattended: boolean;
}

export interface ReceiptPrintJobs {
  standingOf(saleId: string): ReceiptPrintStanding | null;
  start<TOutcome>(
    saleId: string,
    run: (runner: ReceiptPrintRunner) => Promise<TOutcome>,
    options?: ReceiptPrintStartOptions,
  ): Promise<ReceiptPrintStart<TOutcome>>;
}

function isPrinterNotConfigured(outcome: unknown): boolean {
  return (
    typeof outcome === "object" &&
    outcome !== null &&
    "kind" in outcome &&
    outcome.kind === "printer_not_configured"
  );
}

interface Job {
  observation: ReceiptPrintObservation;
  abort: AbortController;
}

interface Entry {
  current: Job | undefined;
  starting: boolean;
}

export function createReceiptPrintJobs({ reportFailure }: ReceiptPrintJobsDeps): ReceiptPrintJobs {
  const entries = new Map<string, Entry>();

  return {
    standingOf(saleId) {
      const job = entries.get(saleId)?.current;
      return job === undefined ? null : receiptPrintStanding(job.observation);
    },

    start(saleId, run, { unattended } = { unattended: false }) {
      const entry = entries.get(saleId) ?? { current: undefined, starting: false };
      entries.set(saleId, entry);
      if (entry.starting || !mayStartReceiptPrint(entry.current?.observation)) {
        return Promise.resolve({ kind: "busy" });
      }
      entry.starting = true;
      const job: Job = {
        observation: startedReceiptPrint(),
        abort: new AbortController(),
      };

      return new Promise((resolve) => {
        let sent = false;
        const standBeforeSending = (
          observe: (observation: ReceiptPrintObservation) => ReceiptPrintObservation,
        ): void => {
          entry.starting = false;
          entry.current?.abort.abort();
          entry.current = job;
          job.observation = observe(job.observation);
        };
        const markSent = (): void => {
          sent = true;
          entry.current?.abort.abort();
          entry.current = job;
          entry.starting = false;
          resolve({ kind: "sent" });
        };
        const watch: ReceiptPrintWatch = {
          signal: job.abort.signal,
          onStatus: (status) => {
            if (entry.current === job) {
              job.observation = observePrinterStatus(job.observation, status);
            }
          },
        };
        const watched = (inner: ReceiptPrinter): ReceiptPrinter => ({
          async print(printWatch, sending) {
            markSent();
            const ending = await inner.print(printWatch, sending);
            if (entry.current === job && ending.kind === "sent") {
              job.observation = observePrintSent(job.observation);
            }
            return ending;
          },
        });
        const printers = (inner: ReceiptPrinters): ReceiptPrinters => ({
          configured() {
            const printer = inner.configured();
            return printer === undefined ? undefined : watched(printer);
          },
        });

        (async () => run({ watch, printers }))().then(
          (outcome) => {
            if (sent) {
              return;
            }
            if (unattended) {
              standBeforeSending(
                isPrinterNotConfigured(outcome) ? observePrinterNotConfigured : observePrintFailed,
              );
            } else {
              entry.starting = false;
            }
            resolve({ kind: "answered", outcome });
          },
          (error: unknown) => {
            reportFailure("printing a receipt", error);
            if (!sent) {
              standBeforeSending(observePrintFailed);
              resolve({ kind: "failed" });
            } else if (entry.current === job) {
              job.observation = observePrintFailed(job.observation);
            }
          },
        );
      });
    },
  };
}
