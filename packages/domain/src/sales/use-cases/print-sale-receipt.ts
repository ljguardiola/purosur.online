import type { PrintedDocumentKey } from "../model/printed-document.js";
import type { ReceiptPrintWatch } from "./receipt-ports.js";
import {
  printReceipt,
  type ReceiptPrintGrant,
  type ReceiptPrintingPorts,
  type ReceiptPrintOutcome,
} from "./receipt-printing.js";

export type PrintSaleReceiptInput = PrintedDocumentKey;

export type PrintSaleReceiptPorts<Grant extends ReceiptPrintGrant, Refusal> = ReceiptPrintingPorts<
  Grant,
  Refusal
>;

export type PrintSaleReceiptOutcome = ReceiptPrintOutcome;

export function printSaleReceipt<Grant extends ReceiptPrintGrant, Refusal>(
  ports: PrintSaleReceiptPorts<Grant, Refusal>,
  key: PrintSaleReceiptInput,
  watch: ReceiptPrintWatch,
): Promise<PrintSaleReceiptOutcome | Refusal> {
  return printReceipt(ports, key, { kind: "retry" }, watch);
}
