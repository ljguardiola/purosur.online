import type { ReceiptContent } from "./receipt-content.js";
import type { SalePrintStanding } from "./sale-print-standing.js";

type ReceiptFiscal = ReceiptFiscalDocument | null;

type ReceiptFiscalDocument =
  | Pick<NonNullable<ReceiptContent["fiscal"]>, "invoiceClass">
  | Pick<
      Extract<NonNullable<ReceiptContent["fiscal"]>, { fortnight: unknown }>,
      "invoiceClass" | "fortnight"
    >;

export function receiptAsksBeforePrinting(fiscal: ReceiptFiscal): boolean {
  return fiscal?.invoiceClass === "C" && !("fortnight" in fiscal);
}

export function receiptAwaitsAnswer(standing: SalePrintStanding, fiscal: ReceiptFiscal): boolean {
  return standing === "never_printed" && receiptAsksBeforePrinting(fiscal);
}
