import { describe, expect, it } from "vitest";
import {
  isSupplierPriceListReadingAbandoned,
  SUPPLIER_PRICE_LIST_READING_ABANDONED_AFTER_MS,
  SUPPLIER_PRICE_LIST_READING_TIME_LIMIT_MS,
} from "./supplier-price-list-reading.js";

const MINUTE_MS = 60 * 1000;
const NOW = new Date("2026-03-10T15:00:00.000Z");

function minutesBeforeNow(minutes: number, extraMs = 0): Date {
  return new Date(NOW.getTime() - minutes * MINUTE_MS - extraMs);
}

describe("supplier price list reading limits", () => {
  it("gives the AI service ten minutes to read a list", () => {
    expect(SUPPLIER_PRICE_LIST_READING_TIME_LIMIT_MS).toBe(10 * MINUTE_MS);
  });

  it("gives up on a reading fifteen minutes after it started, past the time the AI service has", () => {
    expect(SUPPLIER_PRICE_LIST_READING_ABANDONED_AFTER_MS).toBe(15 * MINUTE_MS);
  });
});

describe("isSupplierPriceListReadingAbandoned", () => {
  it("abandons a sent reading once fifteen minutes passed since it was sent", () => {
    expect(
      isSupplierPriceListReadingAbandoned(
        { sentAt: minutesBeforeNow(15, 1), readingStartedAt: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("keeps a sent reading exactly fifteen minutes after it was sent", () => {
    expect(
      isSupplierPriceListReadingAbandoned(
        { sentAt: minutesBeforeNow(15), readingStartedAt: null },
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

  it("abandons an unsent reading once fifteen minutes passed since it started", () => {
    expect(
      isSupplierPriceListReadingAbandoned(
        { sentAt: null, readingStartedAt: minutesBeforeNow(15, 1) },
        NOW,
      ),
    ).toBe(true);
  });

  it("keeps an unsent reading exactly fifteen minutes after it started", () => {
    expect(
      isSupplierPriceListReadingAbandoned(
        { sentAt: null, readingStartedAt: minutesBeforeNow(15) },
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
