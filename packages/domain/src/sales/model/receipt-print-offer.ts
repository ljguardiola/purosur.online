export const RECEIPT_PRINT_OFFER_MS = 10_000;

export function receiptPrintOfferDeadline(offeredAt: Date): Date {
  return new Date(offeredAt.getTime() + RECEIPT_PRINT_OFFER_MS);
}

export function receiptPrintOfferLapsed(deadline: Date, now: Date): boolean {
  return now.getTime() >= deadline.getTime();
}

export function receiptPrintOfferRemainingMs(deadline: Date, now: Date): number {
  return Math.max(0, deadline.getTime() - now.getTime());
}
