import type { Clock } from "../../shared/index.js";
import { receiptAwaitsAnswer } from "../model/receipt-asks-before-printing.js";
import { receiptContent } from "../model/receipt-content.js";
import { salePrintStanding } from "../model/sale-print-standing.js";
import type { ReceiptLedger } from "./receipt-ports.js";

export interface DeclineSaleReceiptPorts {
  ledger: ReceiptLedger;
  clock: Clock;
}

export interface DeclineSaleReceiptInput {
  saleId: string;
}

export type DeclineSaleReceiptOutcome =
  | { kind: "declined" }
  | { kind: "not_found" }
  | { kind: "not_awaiting" };

export function declineSaleReceipt(
  { ledger, clock }: DeclineSaleReceiptPorts,
  { saleId }: DeclineSaleReceiptInput,
): DeclineSaleReceiptOutcome {
  const key = { document: "sale_receipt", saleId } as const;
  return ledger.transaction((tx): DeclineSaleReceiptOutcome => {
    const delivery = tx.receiptDelivery(key);
    if (delivery === undefined) {
      return { kind: "not_found" };
    }
    const standing = salePrintStanding(delivery);
    if (standing === "declined") {
      return { kind: "declined" };
    }
    if (!receiptAwaitsAnswer(standing, receiptContent(tx.receiptSource(saleId)).fiscal)) {
      return { kind: "not_awaiting" };
    }
    tx.recordPrintDeclined(key, clock.now());
    return { kind: "declined" };
  });
}
