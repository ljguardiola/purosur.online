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

export type ReprintSaleReceiptInput = PrintedDocumentKey & { reason: string };

export type ReprintSaleReceiptPorts<
  Grant extends ReceiptPrintGrant,
  Refusal,
> = ReceiptPrintingPorts<Grant, Refusal>;

export type ReprintSaleReceiptOutcome =
  | ReceiptPrintOutcome
  | { kind: "invalid_reason"; maxLength: number };

export async function reprintSaleReceipt<Grant extends ReceiptPrintGrant, Refusal>(
  ports: ReprintSaleReceiptPorts<Grant, Refusal>,
  { reason, ...key }: ReprintSaleReceiptInput,
  watch: ReceiptPrintWatch,
): Promise<ReprintSaleReceiptOutcome | Refusal> {
  const text = receiptReprintReason(reason);
  if (text === undefined) {
    return { kind: "invalid_reason", maxLength: RECEIPT_REPRINT_REASON_MAX_LENGTH };
  }
  return printReceipt(ports, key, { kind: "requested", text }, watch);
}
