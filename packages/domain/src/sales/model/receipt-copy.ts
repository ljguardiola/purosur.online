export interface ReceiptDelivery {
  printAttemptedAt: Date | null;
  printedAt: Date | null;
  reprintCount: number;
}

export type ReceiptCopy = { kind: "original" } | { kind: "duplicate"; orderNumber: number };

export function nextReceiptCopy({ printAttemptedAt, reprintCount }: ReceiptDelivery): ReceiptCopy {
  return printAttemptedAt === null
    ? { kind: "original" }
    : { kind: "duplicate", orderNumber: reprintCount + 1 };
}
