import type { ReceiptContent } from "./receipt-content.js";

export function receiptAsksBeforePrinting(
  fiscal: Pick<NonNullable<ReceiptContent["fiscal"]>, "invoiceClass"> | null,
): boolean {
  return fiscal?.invoiceClass === "C";
}
