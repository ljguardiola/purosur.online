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
} from "./receipt-requests";
import { TcpReceiptPrinter, type TcpReceiptPrinterOptions } from "./tcp-receipt-printer";

function savedReceiptPrinters(
  settings: SqliteReceiptPrinterSettings,
  connect: TcpReceiptPrinterOptions["connect"],
): ReceiptPrinters {
  return {
    configured() {
      return settings.receiptPrinterAddress() === undefined
        ? undefined
        : new TcpReceiptPrinter({
            address: () => settings.receiptPrinterAddress(),
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
  beforePrinting: (saleId: string) => Promise<void>;
  reportFailure: (context: string, error: unknown) => void;
  syncNow: () => void;
}

interface ReceiptPrinting {
  afterCompletedSale<TRequest, TOutcome extends { kind: string }>(
    charge: ((request: TRequest) => Promise<TOutcome>) | undefined,
  ): ((request: TRequest) => Promise<TOutcome>) | undefined;
  receiptPrintStatus: ((saleId: string) => ReturnType<typeof receiptPrintStatusFor>) | undefined;
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
  beforePrinting,
  reportFailure,
  syncNow,
}: ReceiptPrintingWiringDeps): ReceiptPrinting {
  if (database === undefined || gate === undefined) {
    return {
      afterCompletedSale: (charge) => charge,
      receiptPrintStatus: undefined,
      reprintSaleReceipt: undefined,
    };
  }
  const jobs = createReceiptPrintJobs({ reportFailure });
  const deps: ReceiptRequestDeps = {
    database,
    gate,
    now,
    ids,
    readOutboxChainKey,
    signedInUserId,
    printers: savedReceiptPrinters(new SqliteReceiptPrinterSettings(database), connectPrinter),
    jobs,
  };
  return {
    afterCompletedSale: (charge) =>
      charge &&
      printingCompletedSales(
        {
          beforePrinting,
          print: (saleId) => printCompletedSaleReceiptFor(deps, saleId),
          syncNow,
          onFailure: (error) => reportFailure("printing a completed sale's receipt", error),
        },
        charge,
      ),
    receiptPrintStatus: (saleId) => receiptPrintStatusFor(deps, saleId),
    reprintSaleReceipt: (request) => reprintSaleReceiptFor(deps, request),
  };
}
