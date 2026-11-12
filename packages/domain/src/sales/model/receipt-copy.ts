export interface ReceiptDelivery {
  printAttemptedAt: Date | null;
  printedAt: Date | null;
  printDeclinedAt: Date | null;
  reprintCount: number;
  voided: boolean;
  creditNoteAuthorized: boolean;
}

export type ReceiptCopy = { kind: "original" } | { kind: "duplicate"; orderNumber: number };

export function nextReceiptCopy({
  printAttemptedAt,
  reprintCount,
}: Pick<ReceiptDelivery, "printAttemptedAt" | "reprintCount">): ReceiptCopy {
  return printAttemptedAt === null
    ? { kind: "original" }
    : { kind: "duplicate", orderNumber: reprintCount + 1 };
}
