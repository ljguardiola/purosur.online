import type { PrintedDocument } from "./printed-document.js";
import type { ReceiptDelivery } from "./receipt-copy.js";

export type ReceiptPrintAvailability =
  | { kind: "available" }
  | { kind: "sale_voided" }
  | { kind: "credit_note_not_authorized" };

export function receiptPrintAvailability(
  document: PrintedDocument,
  { voided, creditNoteAuthorized }: Pick<ReceiptDelivery, "voided" | "creditNoteAuthorized">,
): ReceiptPrintAvailability {
  if (document === "credit_note") {
    return creditNoteAuthorized ? { kind: "available" } : { kind: "credit_note_not_authorized" };
  }
  return voided ? { kind: "sale_voided" } : { kind: "available" };
}
