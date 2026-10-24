import { isReprintedOnlyAsDuplicate, type PrintedDocumentKey } from "../model/printed-document.js";
import {
  RECEIPT_REPRINT_REASON_MAX_LENGTH,
  receiptReprintReason,
} from "../model/receipt-reprint-reason.js";
import type { ReceiptPrintWatch } from "./receipt-ports.js";
import {
  type DuplicateReceiptPrintOutcome,
  printDuplicateOnly,
  printReceipt,
  type ReceiptPrintGrant,
  type ReceiptPrintingPorts,
} from "./receipt-printing.js";

export type ReprintReceiptInput = PrintedDocumentKey & { reason: string };

export type ReprintReceiptPorts<Grant extends ReceiptPrintGrant, Refusal> = ReceiptPrintingPorts<
  Grant,
  Refusal
>;

export type ReprintReceiptOutcome =
  | DuplicateReceiptPrintOutcome
  | { kind: "invalid_reason"; maxLength: number };

export async function reprintReceipt<Grant extends ReceiptPrintGrant, Refusal>(
  ports: ReprintReceiptPorts<Grant, Refusal>,
  { reason, ...key }: ReprintReceiptInput,
  watch: ReceiptPrintWatch,
): Promise<ReprintReceiptOutcome | Refusal> {
  const text = receiptReprintReason(reason);
  if (text === undefined) {
    return { kind: "invalid_reason", maxLength: RECEIPT_REPRINT_REASON_MAX_LENGTH };
  }
  const requested = { kind: "requested", text } as const;
  return isReprintedOnlyAsDuplicate(key.document)
    ? printDuplicateOnly(ports, key, requested, watch)
    : printReceipt(ports, key, requested, watch);
}
