import type { PrintedDocumentKey } from "../model/printed-document.js";
import {
  RECEIPT_REPRINT_REASON_MAX_LENGTH,
  receiptReprintReason,
} from "../model/receipt-reprint-reason.js";
import type { ReceiptPrintWatch } from "./receipt-ports.js";
import {
  printReceipt,
  type ReceiptPrintGrant,
  type ReceiptPrintingPorts,
  type ReceiptPrintOutcome,
} from "./receipt-printing.js";

export type ReprintReceiptInput = PrintedDocumentKey & { reason: string };

export type ReprintReceiptPorts<Grant extends ReceiptPrintGrant, Refusal> = ReceiptPrintingPorts<
  Grant,
  Refusal
>;

export type ReprintReceiptOutcome =
  | ReceiptPrintOutcome
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
  return printReceipt(ports, key, { kind: "requested", text }, watch);
}
