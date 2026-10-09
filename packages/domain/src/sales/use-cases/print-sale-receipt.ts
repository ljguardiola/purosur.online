import type { ReceiptPrintWatch } from "./receipt-ports.js";
import {
  printReceipt,
  type ReceiptPrintGrant,
  type ReceiptPrintingPorts,
  type ReceiptPrintOutcome,
} from "./receipt-printing.js";

export interface PrintSaleReceiptInput {
  saleId: string;
}

export type PrintSaleReceiptPorts<Grant extends ReceiptPrintGrant, Refusal> = ReceiptPrintingPorts<
  Grant,
  Refusal
>;

export type PrintSaleReceiptOutcome = ReceiptPrintOutcome;

export function printSaleReceipt<Grant extends ReceiptPrintGrant, Refusal>(
  ports: PrintSaleReceiptPorts<Grant, Refusal>,
  { saleId }: PrintSaleReceiptInput,
  watch: ReceiptPrintWatch,
): Promise<PrintSaleReceiptOutcome | Refusal> {
  return printReceipt(ports, saleId, { kind: "retry" }, watch);
}
