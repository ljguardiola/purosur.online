import type { Clock } from "../../shared/index.js";
import { receiptAwaitsAnswer } from "../model/receipt-asks-before-printing.js";
import { receiptContent } from "../model/receipt-content.js";
import {
  receiptPrintOfferLapsed,
  receiptPrintOfferRemainingMs,
} from "../model/receipt-print-offer.js";
import { salePrintStanding } from "../model/sale-print-standing.js";
import type { ReceiptLedger } from "./receipt-ports.js";

export interface LapseReceiptPrintOfferPorts {
  ledger: ReceiptLedger;
  clock: Clock;
}

export interface LapseReceiptPrintOfferInput {
  saleId: string;
  deadline: Date;
}

export type LapseReceiptPrintOfferOutcome =
  | { kind: "open"; remainingMs: number }
  | { kind: "lapsed" }
  | { kind: "not_found" }
  | { kind: "not_awaiting" };

export function lapseReceiptPrintOffer(
  { ledger, clock }: LapseReceiptPrintOfferPorts,
  { saleId, deadline }: LapseReceiptPrintOfferInput,
): LapseReceiptPrintOfferOutcome {
  const key = { document: "sale_receipt", saleId } as const;
  return ledger.transaction((tx): LapseReceiptPrintOfferOutcome => {
    const delivery = tx.receiptDelivery(key);
    if (delivery === undefined) {
      return { kind: "not_found" };
    }
    const standing = salePrintStanding(delivery);
    if (standing === "declined") {
      return { kind: "lapsed" };
    }
    if (!receiptAwaitsAnswer(standing, receiptContent(tx.receiptSource(saleId)).fiscal)) {
      return { kind: "not_awaiting" };
    }
    const now = clock.now();
    if (!receiptPrintOfferLapsed(deadline, now)) {
      return { kind: "open", remainingMs: receiptPrintOfferRemainingMs(deadline, now) };
    }
    tx.recordPrintDeclined(key, now);
    return { kind: "lapsed" };
  });
}
