import type { ReceiptPrintWatch } from "./receipt-ports.js";
import {
  printReceipt,
  type ReceiptPrintGrant,
  type ReceiptPrintingPorts,
  type ReceiptPrintOutcome,
} from "./receipt-printing.js";

export interface ReprintSaleReceiptInput {
  saleId: string;
  reason: string;
}

export type ReprintSaleReceiptPorts<
  Grant extends ReceiptPrintGrant,
  Refusal,
> = ReceiptPrintingPorts<Grant, Refusal>;

export type ReprintSaleReceiptOutcome = ReceiptPrintOutcome;

export function reprintSaleReceipt<Grant extends ReceiptPrintGrant, Refusal>(
  ports: ReprintSaleReceiptPorts<Grant, Refusal>,
  { saleId, reason }: ReprintSaleReceiptInput,
  watch: ReceiptPrintWatch,
): Promise<ReprintSaleReceiptOutcome | Refusal> {
  return printReceipt(ports, saleId, { kind: "requested", text: reason }, watch);
}
