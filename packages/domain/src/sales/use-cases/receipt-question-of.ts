import { receiptAwaitsAnswer } from "../model/receipt-asks-before-printing.js";
import { receiptContent } from "../model/receipt-content.js";
import { salePrintStanding } from "../model/sale-print-standing.js";
import type { ReceiptLedger } from "./receipt-ports.js";

export interface ReceiptQuestionOfPorts {
  ledger: ReceiptLedger;
}

export interface ReceiptQuestionOfInput {
  saleId: string;
}

export type ReceiptQuestionOfOutcome =
  | { kind: "asks" }
  | { kind: "prints" }
  | { kind: "not_found" };

export function receiptQuestionOf(
  { ledger }: ReceiptQuestionOfPorts,
  { saleId }: ReceiptQuestionOfInput,
): ReceiptQuestionOfOutcome {
  return ledger.transaction((tx): ReceiptQuestionOfOutcome => {
    const delivery = tx.receiptDelivery({ document: "sale_receipt", saleId });
    if (delivery === undefined) {
      return { kind: "not_found" };
    }
    return receiptAwaitsAnswer(
      salePrintStanding(delivery),
      receiptContent(tx.receiptSource(saleId)).fiscal,
    )
      ? { kind: "asks" }
      : { kind: "prints" };
  });
}
