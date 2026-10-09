import {
  mayStartReceiptPrint,
  observePrintAcknowledged,
  observePrinterStatus,
  type ReceiptPrintObservation,
  type ReceiptPrintStanding,
  receiptPrintStanding,
  startedReceiptPrint,
} from "@purosur/domain";
import type { ReceiptPrinter, ReceiptPrintWatch } from "@purosur/domain/sales/use-cases";

export interface ReceiptPrintJobsDeps {
  now: () => Date;
  reportFailure: (context: string, error: unknown) => void;
}

interface ReceiptPrintRunner {
  watch: ReceiptPrintWatch;
  printer: (inner: ReceiptPrinter) => ReceiptPrinter;
}

type ReceiptPrintStart<TOutcome> =
  | { kind: "busy" }
  | { kind: "sent" }
  | { kind: "answered"; outcome: TOutcome }
  | { kind: "failed" };

export interface ReceiptPrintJobs {
  standing(saleId: string): ReceiptPrintStanding | null;
  start<TOutcome>(
    saleId: string,
    run: (runner: ReceiptPrintRunner) => Promise<TOutcome>,
  ): Promise<ReceiptPrintStart<TOutcome>>;
}

interface Job {
  observation: ReceiptPrintObservation;
  abort: AbortController;
}

interface Entry {
  current: Job | undefined;
  starting: boolean;
}

export function createReceiptPrintJobs({
  now,
  reportFailure,
}: ReceiptPrintJobsDeps): ReceiptPrintJobs {
  const entries = new Map<string, Entry>();

  return {
    standing(saleId) {
      const job = entries.get(saleId)?.current;
      return job === undefined ? null : receiptPrintStanding(job.observation, now());
    },

    start(saleId, run) {
      const entry = entries.get(saleId) ?? { current: undefined, starting: false };
      entries.set(saleId, entry);
      if (entry.starting || !mayStartReceiptPrint(entry.current?.observation, now())) {
        return Promise.resolve({ kind: "busy" });
      }
      entry.starting = true;
      const job: Job = { observation: startedReceiptPrint(), abort: new AbortController() };

      return new Promise((resolve) => {
        let sent = false;
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
              job.observation = observePrinterStatus(job.observation, status, now());
            }
          },
        };
        const printer = (inner: ReceiptPrinter): ReceiptPrinter => ({
          async print(bytes, printWatch) {
            markSent();
            const ending = await inner.print(bytes, printWatch);
            if (ending.kind === "acknowledged" && entry.current === job) {
              job.observation = observePrintAcknowledged(job.observation);
            }
            return ending;
          },
        });

        (async () => run({ watch, printer }))().then(
          (outcome) => {
            if (!sent) {
              entry.starting = false;
              resolve({ kind: "answered", outcome });
            }
          },
          (error: unknown) => {
            reportFailure("printing a receipt", error);
            if (!sent) {
              entry.starting = false;
              resolve({ kind: "failed" });
            } else if (entry.current === job && !job.observation.acknowledged) {
              entry.current = undefined;
            }
          },
        );
      });
    },
  };
}
