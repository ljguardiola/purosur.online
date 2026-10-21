import type { PrintedDocument } from "./printed-document.js";
import type { ReceiptDelivery } from "./receipt-copy.js";

export type SaleReceiptAvailability = { kind: "available" } | { kind: "sale_voided" };

export type ReceiptPrintAvailability =
  | SaleReceiptAvailability
  | { kind: "credit_note_not_authorized" };

export function receiptPrintAvailability(
  document: "sale_receipt",
  delivery: Pick<ReceiptDelivery, "voided">,
): SaleReceiptAvailability;
export function receiptPrintAvailability(
  document: PrintedDocument,
  delivery: Pick<ReceiptDelivery, "voided" | "creditNoteAuthorized">,
): ReceiptPrintAvailability;
export function receiptPrintAvailability(
  document: PrintedDocument,
  {
    voided,
    creditNoteAuthorized,
  }: Pick<ReceiptDelivery, "voided"> & Partial<Pick<ReceiptDelivery, "creditNoteAuthorized">>,
): ReceiptPrintAvailability {
  if (document === "credit_note") {
    return creditNoteAuthorized === true
      ? { kind: "available" }
      : { kind: "credit_note_not_authorized" };
  }
  return voided ? { kind: "sale_voided" } : { kind: "available" };
}
