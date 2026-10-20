import type { ReceiptPrinters } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteReceiptPrinterSettings } from "../register/sqlite-receipt-printer-settings";
import type { ActionGate } from "../sessions/action-gate";
import { printCreditNoteFor, printVoidedSaleCreditNoteFor } from "./credit-note-receipt-requests";
import {
  type PrintingCompletedSalesDeps,
  printingCompletedSales,
  printingEachCompletedSale,
} from "./printing-completed-sales";
import { createReceiptPrintJobs } from "./receipt-print-jobs";
import {
  TcpReceiptPrinter,
  type TcpReceiptPrinterOptions,
} from "./receipt-printer/tcp-receipt-printer";
import {
  printCompletedSaleReceiptFor,
  printOriginalReceiptFor,
  type ReceiptRequestDeps,
  receiptPrintStatusFor,
  reprintSaleReceiptFor,
} from "./receipt-requests";

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

export interface ReceiptPrinting {
  afterCompletedSale<TRequest, TOutcome extends { kind: string }>(
    charge: ((request: TRequest) => Promise<TOutcome>) | undefined,
  ): ((request: TRequest) => Promise<TOutcome>) | undefined;
  afterEachCompletedSale<TRequest, TFollowed extends { followed: { outcome: { kind: string } }[] }>(
    follow: ((request: TRequest) => Promise<TFollowed>) | undefined,
  ): ((request: TRequest) => Promise<TFollowed>) | undefined;
  receiptPrintStatus: ((saleId: string) => ReturnType<typeof receiptPrintStatusFor>) | undefined;
  printOriginalReceipt:
    | ((saleId: string) => ReturnType<typeof printOriginalReceiptFor>)
    | undefined;
  reprintSaleReceipt:
    | ((
        request: Parameters<typeof reprintSaleReceiptFor>[1],
      ) => ReturnType<typeof reprintSaleReceiptFor>)
    | undefined;
  printCreditNote: ((saleId: string) => ReturnType<typeof printCreditNoteFor>) | undefined;
  printVoidedSaleCreditNote: (saleId: string) => Promise<void>;
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
      afterEachCompletedSale: (follow) => follow,
      receiptPrintStatus: undefined,
      printOriginalReceipt: undefined,
      reprintSaleReceipt: undefined,
      printCreditNote: undefined,
      printVoidedSaleCreditNote: async () => undefined,
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
  const printing: PrintingCompletedSalesDeps = {
    beforePrinting,
    print: (saleId) => printCompletedSaleReceiptFor(deps, saleId),
    syncNow,
    onFailure: (error) => reportFailure("printing a completed sale's receipt", error),
  };
  return {
    afterCompletedSale: (charge) => charge && printingCompletedSales(printing, charge),
    afterEachCompletedSale: (follow) => follow && printingEachCompletedSale(printing, follow),
    receiptPrintStatus: (saleId) => receiptPrintStatusFor(deps, saleId),
    printOriginalReceipt: (saleId) => printOriginalReceiptFor(deps, saleId),
    reprintSaleReceipt: (request) => reprintSaleReceiptFor(deps, request),
    printCreditNote: (saleId) => printCreditNoteFor(deps, saleId),
    printVoidedSaleCreditNote: (saleId) => printVoidedSaleCreditNoteFor(deps, saleId),
  };
}
