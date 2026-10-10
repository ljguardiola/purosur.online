import { mayRetryReceiptPrint } from "../model/receipt-print-standing.js";
import type { ReceiptPrintStandings, ReceiptPrintWatch } from "./receipt-ports.js";
import {
  printGrantedReceipt,
  type ReceiptPrintGrant,
  type ReceiptPrintingPorts,
  type ReceiptPrintOutcome,
} from "./receipt-printing.js";

export interface RetrySaleReceiptPrintInput {
  saleId: string;
}

export interface RetrySaleReceiptPrintPorts<Grant extends ReceiptPrintGrant, Refusal>
  extends ReceiptPrintingPorts<Grant, Refusal> {
  standings: ReceiptPrintStandings;
}

export type RetrySaleReceiptPrintOutcome = ReceiptPrintOutcome | { kind: "not_offered" };

export async function retrySaleReceiptPrint<Grant extends ReceiptPrintGrant, Refusal>(
  ports: RetrySaleReceiptPrintPorts<Grant, Refusal>,
  { saleId }: RetrySaleReceiptPrintInput,
  watch: ReceiptPrintWatch,
): Promise<RetrySaleReceiptPrintOutcome | Refusal> {
  const authorization = await ports.authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  if (!mayRetryReceiptPrint(ports.standings.standingOf(saleId))) {
    return { kind: "not_offered" };
  }
  return printGrantedReceipt(ports, authorization.grant, saleId, { kind: "retry" }, watch);
}
