import type { ReceiptPrintWatch } from "./receipt-ports.js";
import {
  type OriginalReceiptPrintOutcome,
  printOriginalOnly,
  type ReceiptPrintGrant,
  type ReceiptPrintingPorts,
} from "./receipt-printing.js";

export interface PrintOriginalReceiptInput {
  saleId: string;
}

export type PrintOriginalReceiptPorts<
  Grant extends ReceiptPrintGrant,
  Refusal,
> = ReceiptPrintingPorts<Grant, Refusal>;

export type PrintOriginalReceiptOutcome = OriginalReceiptPrintOutcome;

export function printOriginalReceipt<Grant extends ReceiptPrintGrant, Refusal>(
  ports: PrintOriginalReceiptPorts<Grant, Refusal>,
  { saleId }: PrintOriginalReceiptInput,
  watch: ReceiptPrintWatch,
): Promise<PrintOriginalReceiptOutcome | Refusal> {
  return printOriginalOnly(ports, saleId, watch);
}
