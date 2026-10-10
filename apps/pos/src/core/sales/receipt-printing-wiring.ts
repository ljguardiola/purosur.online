import type { ReceiptPrinters } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteReceiptPrinterSettings } from "../register/sqlite-receipt-printer-settings";
import type { ActionGate } from "../sessions/action-gate";
import { printingCompletedSales } from "./printing-completed-sales";
import { createReceiptPrintJobs } from "./receipt-print-jobs";
import {
  printCompletedSaleReceiptFor,
  type ReceiptRequestDeps,
  receiptPrintStatusFor,
  reprintSaleReceiptFor,
  retryReceiptPrintFor,
} from "./receipt-requests";
import { TcpReceiptPrinter, type TcpReceiptPrinterOptions } from "./tcp-receipt-printer";

function savedReceiptPrinters(
  settings: SqliteReceiptPrinterSettings,
  connect: TcpReceiptPrinterOptions["connect"],
): ReceiptPrinters {
  return {
    configured() {
      const address = settings.receiptPrinterAddress();
      return address === undefined
        ? undefined
        : new TcpReceiptPrinter({
            host: address.host,
            ...(address.port === null ? {} : { port: address.port }),
            ...(connect === undefined ? {} : { connect }),
          });
    },
  };
}

export interface ReceiptPrintingWiringDeps {
  database: LocalDatabase | undefined;
  gate: ActionGate | undefined;
  now: ReceiptRequestDeps["now"];
  ids: ReceiptRequestDeps["ids"];
  readOutboxChainKey: ReceiptRequestDeps["readOutboxChainKey"];
  signedInUserId: ReceiptRequestDeps["signedInUserId"];
  connectPrinter?: TcpReceiptPrinterOptions["connect"];
  reportFailure: (context: string, error: unknown) => void;
  syncNow: () => void;
}

interface ReceiptPrinting {
  afterCompletedSale<TRequest, TOutcome extends { kind: string }>(
    charge: ((request: TRequest) => Promise<TOutcome>) | undefined,
  ): ((request: TRequest) => Promise<TOutcome>) | undefined;
  receiptPrintStatus: ((saleId: string) => ReturnType<typeof receiptPrintStatusFor>) | undefined;
  retryReceiptPrint: ((saleId: string) => ReturnType<typeof retryReceiptPrintFor>) | undefined;
  reprintSaleReceipt:
    | ((
        request: Parameters<typeof reprintSaleReceiptFor>[1],
      ) => ReturnType<typeof reprintSaleReceiptFor>)
    | undefined;
}

export function createReceiptPrinting({
  database,
  gate,
  now,
  ids,
  readOutboxChainKey,
  signedInUserId,
  connectPrinter,
  reportFailure,
  syncNow,
}: ReceiptPrintingWiringDeps): ReceiptPrinting {
  if (database === undefined || gate === undefined) {
    return {
      afterCompletedSale: (charge) => charge,
      receiptPrintStatus: undefined,
      retryReceiptPrint: undefined,
      reprintSaleReceipt: undefined,
    };
  }
  const deps: ReceiptRequestDeps = {
    database,
    gate,
    now,
    ids,
    readOutboxChainKey,
    signedInUserId,
    printers: savedReceiptPrinters(new SqliteReceiptPrinterSettings(database), connectPrinter),
    jobs: createReceiptPrintJobs({ now, reportFailure }),
  };
  return {
    afterCompletedSale: (charge) =>
      charge &&
      printingCompletedSales(
        {
          print: (saleId) => printCompletedSaleReceiptFor(deps, saleId),
          syncNow,
          onFailure: (error) => reportFailure("printing a completed sale's receipt", error),
        },
        charge,
      ),
    receiptPrintStatus: (saleId) => receiptPrintStatusFor(deps, saleId),
    retryReceiptPrint: (saleId) => retryReceiptPrintFor(deps, saleId),
    reprintSaleReceipt: (request) => reprintSaleReceiptFor(deps, request),
  };
}
