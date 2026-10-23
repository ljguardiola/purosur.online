import { describe, expect, it } from "vitest";
import {
  isSupplierPriceListReadingAbandoned,
  SUPPLIER_PRICE_LIST_ABANDONED_READING_CHECK_INTERVAL_MS,
  SUPPLIER_PRICE_LIST_READING_ABANDONED_AFTER_MS,
  SUPPLIER_PRICE_LIST_READING_TIME_LIMIT_MS,
} from "./supplier-price-list-reading.js";

const MINUTE_MS = 60 * 1000;
const NOW = new Date("2026-03-10T15:00:00.000Z");

function minutesBeforeNow(minutes: number, extraMs = 0): Date {
  return new Date(NOW.getTime() - minutes * MINUTE_MS - extraMs);
}

describe("supplier price list reading limits", () => {
  it("gives the AI service twenty minutes to read a list", () => {
    expect(SUPPLIER_PRICE_LIST_READING_TIME_LIMIT_MS).toBe(20 * MINUTE_MS);
  });

  it("gives up on a reading twenty-five minutes after it started, past the time the AI service has", () => {
    expect(SUPPLIER_PRICE_LIST_READING_ABANDONED_AFTER_MS).toBe(25 * MINUTE_MS);
  });

  it("looks for abandoned readings every minute", () => {
    expect(SUPPLIER_PRICE_LIST_ABANDONED_READING_CHECK_INTERVAL_MS).toBe(MINUTE_MS);
  });
});

describe("isSupplierPriceListReadingAbandoned", () => {
  it("abandons a sent reading once twenty-five minutes passed since it was sent", () => {
    expect(
      isSupplierPriceListReadingAbandoned(
        { sentAt: minutesBeforeNow(25, 1), readingStartedAt: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("keeps a sent reading exactly twenty-five minutes after it was sent", () => {
    expect(
      isSupplierPriceListReadingAbandoned(
        { sentAt: minutesBeforeNow(25), readingStartedAt: null },
        NOW,
      ),
    ).toBe(false);
  });

  it("measures a sent reading from when it was sent, not from when its reading started", () => {
    expect(
      isSupplierPriceListReadingAbandoned(
        { sentAt: minutesBeforeNow(1), readingStartedAt: minutesBeforeNow(30) },
        NOW,
      ),
    ).toBe(false);
  });

  it("abandons an unsent reading once twenty-five minutes passed since it started", () => {
    expect(
      isSupplierPriceListReadingAbandoned(
        { sentAt: null, readingStartedAt: minutesBeforeNow(25, 1) },
        NOW,
      ),
    ).toBe(true);
  });

  it("keeps an unsent reading exactly twenty-five minutes after it started", () => {
    expect(
      isSupplierPriceListReadingAbandoned(
        { sentAt: null, readingStartedAt: minutesBeforeNow(25) },
        NOW,
      ),
    ).toBe(false);
  });

  it("never abandons a list whose reading has not started, however long it waits", () => {
    expect(
      isSupplierPriceListReadingAbandoned(
        { sentAt: null, readingStartedAt: null },
        new Date("2099-01-01T00:00:00.000Z"),
      ),
    ).toBe(false);
  });
});
