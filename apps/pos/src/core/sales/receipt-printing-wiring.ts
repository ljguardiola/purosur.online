import type { ReceiptPrinters } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteReceiptPrinterSettings } from "../register/sqlite-receipt-printer-settings";
import type { ActionGate } from "../sessions/action-gate";
import {
  printCreditNoteFor,
  printSaleCreditNoteFor,
  reprintCreditNoteFor,
} from "./credit-note-receipt-requests";
import {
  type DeferredSaleInvoiceRequestDeps,
  findDeferredSaleFor,
  printDeferredSaleInvoiceFor,
  reprintDeferredSaleInvoiceFor,
} from "./deferred-sale-invoice-requests";
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

export function savedReceiptPrinters(
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
  deferredSaleInvoicing?: DeferredSaleInvoiceRequestDeps["invoicing"] | undefined;
  beforePrinting: (saleId: string) => Promise<void>;
  reportFailure: (context: string, error: unknown) => void;
  syncNow: () => void;
  ticketedSteps: ReceiptRequestDeps["ticketedSteps"];
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
  findDeferredSale:
    | ((
        reading: Parameters<typeof findDeferredSaleFor>[1],
      ) => ReturnType<typeof findDeferredSaleFor>)
    | undefined;
  printDeferredSaleInvoice:
    | ((saleId: string) => ReturnType<typeof printDeferredSaleInvoiceFor>)
    | undefined;
  reprintDeferredSaleInvoice:
    | ((
        request: Parameters<typeof reprintDeferredSaleInvoiceFor>[1],
      ) => ReturnType<typeof reprintDeferredSaleInvoiceFor>)
    | undefined;
  printCreditNote:
    | ((
        creditNote: Parameters<typeof printCreditNoteFor>[1],
      ) => ReturnType<typeof printCreditNoteFor>)
    | undefined;
  reprintCreditNote:
    | ((
        request: Parameters<typeof reprintCreditNoteFor>[1],
      ) => ReturnType<typeof reprintCreditNoteFor>)
    | undefined;
  printSaleCreditNote: (creditNote: { saleId: string; creditNoteId: string }) => Promise<void>;
}

export function createReceiptPrinting({
  database,
  gate,
  now,
  ids,
  readOutboxChainKey,
  signedInUserId,
  connectPrinter,
  deferredSaleInvoicing,
  beforePrinting,
  reportFailure,
  syncNow,
  ticketedSteps,
}: ReceiptPrintingWiringDeps): ReceiptPrinting {
  if (database === undefined || gate === undefined) {
    return {
      afterCompletedSale: (charge) => charge,
      afterEachCompletedSale: (follow) => follow,
      receiptPrintStatus: undefined,
      printOriginalReceipt: undefined,
      findDeferredSale: undefined,
      printDeferredSaleInvoice: undefined,
      reprintDeferredSaleInvoice: undefined,
      reprintSaleReceipt: undefined,
      printCreditNote: undefined,
      reprintCreditNote: undefined,
      printSaleCreditNote: async () => undefined,
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
    ticketedSteps,
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
    findDeferredSale: (reading) => findDeferredSaleFor(deps, reading),
    printDeferredSaleInvoice:
      deferredSaleInvoicing &&
      ((saleId) =>
        printDeferredSaleInvoiceFor({ ...deps, invoicing: deferredSaleInvoicing }, saleId)),
    reprintDeferredSaleInvoice: (request) => reprintDeferredSaleInvoiceFor(deps, request),
    reprintSaleReceipt: (request) => reprintSaleReceiptFor(deps, request),
    printCreditNote: (creditNote) => printCreditNoteFor(deps, creditNote),
    reprintCreditNote: (request) => reprintCreditNoteFor(deps, request),
    printSaleCreditNote: (creditNote) => printSaleCreditNoteFor(deps, creditNote),
  };
}
