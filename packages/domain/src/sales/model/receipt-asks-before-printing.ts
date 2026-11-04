import type { ReceiptContent } from "./receipt-content.js";
import type { SalePrintStanding } from "./sale-print-standing.js";

type ReceiptFiscal = Pick<NonNullable<ReceiptContent["fiscal"]>, "invoiceClass"> | null;

export function receiptAsksBeforePrinting(fiscal: ReceiptFiscal): boolean {
  return fiscal?.invoiceClass === "C";
}

export function receiptAwaitsAnswer(standing: SalePrintStanding, fiscal: ReceiptFiscal): boolean {
  return standing === "never_printed" && receiptAsksBeforePrinting(fiscal);
}
