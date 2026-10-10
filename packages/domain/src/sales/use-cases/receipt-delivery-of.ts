import { nextReceiptCopy, type ReceiptCopy } from "../model/receipt-copy.js";
import type { ReceiptLedger } from "./receipt-ports.js";

export interface ReceiptDeliveryOfPorts {
  ledger: ReceiptLedger;
}

export interface ReceiptDeliveryOfInput {
  saleId: string;
}

export type ReceiptDeliveryOfOutcome =
  | { kind: "not_found" }
  | {
      kind: "found";
      nextCopy: ReceiptCopy;
      printAttemptedAt: Date | null;
      printedAt: Date | null;
    };

export function receiptDeliveryOf(
  { ledger }: ReceiptDeliveryOfPorts,
  { saleId }: ReceiptDeliveryOfInput,
): ReceiptDeliveryOfOutcome {
  return ledger.transaction((tx): ReceiptDeliveryOfOutcome => {
    const delivery = tx.receiptDelivery(saleId);
    return delivery === undefined
      ? { kind: "not_found" }
      : {
          kind: "found",
          nextCopy: nextReceiptCopy(delivery),
          printAttemptedAt: delivery.printAttemptedAt,
          printedAt: delivery.printedAt,
        };
  });
}
