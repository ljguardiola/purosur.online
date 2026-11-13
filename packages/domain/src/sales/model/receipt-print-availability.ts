import type { PrintedDocument } from "./printed-document.js";
import { nextReceiptCopy, type ReceiptDelivery } from "./receipt-copy.js";

export type SaleReceiptAvailability = { kind: "available" } | { kind: "sale_voided" };

export type ReceiptPrintAvailability =
  | SaleReceiptAvailability
  | { kind: "credit_note_not_authorized" };

type DeliveryFacts = Pick<ReceiptDelivery, "voided" | "printAttemptedAt" | "reprintCount">;

type ReceiptPrintRequest = "print" | "reprint_with_reason";

export function receiptPrintAvailability(
  document: "sale_receipt",
  delivery: DeliveryFacts,
  request: ReceiptPrintRequest,
): SaleReceiptAvailability;
export function receiptPrintAvailability(
  document: PrintedDocument,
  delivery: DeliveryFacts & Pick<ReceiptDelivery, "creditNoteAuthorized">,
  request: ReceiptPrintRequest,
): ReceiptPrintAvailability;
export function receiptPrintAvailability(
  document: PrintedDocument,
  {
    creditNoteAuthorized,
    ...delivery
  }: DeliveryFacts & Partial<Pick<ReceiptDelivery, "creditNoteAuthorized">>,
  request: ReceiptPrintRequest,
): ReceiptPrintAvailability {
  if (document === "credit_note") {
    return creditNoteAuthorized === true
      ? { kind: "available" }
      : { kind: "credit_note_not_authorized" };
  }
  if (!delivery.voided) {
    return { kind: "available" };
  }
  return document === "sale_receipt" &&
    request === "reprint_with_reason" &&
    nextReceiptCopy(delivery).kind === "duplicate"
    ? { kind: "available" }
    : { kind: "sale_voided" };
}
