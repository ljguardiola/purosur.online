import type { ReceiptDelivery } from "./receipt-copy.js";

export type ReceiptPrintAvailability = { kind: "available" } | { kind: "sale_voided" };

export function receiptPrintAvailability({
  voided,
}: Pick<ReceiptDelivery, "voided">): ReceiptPrintAvailability {
  return voided ? { kind: "sale_voided" } : { kind: "available" };
}
