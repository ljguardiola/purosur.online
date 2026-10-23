export const SUPPLIER_PRICE_LIST_READING_TIME_LIMIT_MS = 10 * 60 * 1000;

export const SUPPLIER_PRICE_LIST_READING_ABANDONED_AFTER_MS = 15 * 60 * 1000;

// A reading that has not started is only waiting its turn, however long it waits.
export function isSupplierPriceListReadingAbandoned(
  reading: { sentAt: Date | null; readingStartedAt: Date | null },
  now: Date,
): boolean {
  const startedAt = reading.sentAt ?? reading.readingStartedAt;
  return (
    startedAt !== null &&
    now.getTime() - startedAt.getTime() > SUPPLIER_PRICE_LIST_READING_ABANDONED_AFTER_MS
  );
}
