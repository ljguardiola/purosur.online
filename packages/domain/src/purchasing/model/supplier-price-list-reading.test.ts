import { describe, expect, it } from "vitest";
import {
  askPriceListRange,
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

type RangeAnswer =
  | { kind: "read"; rows: string[] }
  | { kind: "invalid_answer" }
  | { kind: "unreadable" }
  | { kind: "unavailable" }
  | { kind: "too_long" };

function answering(...answers: RangeAnswer[]) {
  const asked: RangeAnswer[] = [];
  return {
    asked,
    ask: async (): Promise<RangeAnswer> => {
      const answer = answers[asked.length] ?? { kind: "unavailable" };
      asked.push(answer);
      return answer;
    },
  };
}

describe("askPriceListRange", () => {
  it("keeps a range's first answer when it is readable, without asking again", async () => {
    const range = answering({ kind: "read", rows: ["Yerba 1 kg"] });

    expect(await askPriceListRange(range.ask)).toEqual({ kind: "read", rows: ["Yerba 1 kg"] });
    expect(range.asked).toHaveLength(1);
  });

  it("asks a range again once when its first answer is invalid, and reads the second", async () => {
    const range = answering({ kind: "invalid_answer" }, { kind: "read", rows: ["Yerba 1 kg"] });

    expect(await askPriceListRange(range.ask)).toEqual({ kind: "read", rows: ["Yerba 1 kg"] });
    expect(range.asked).toHaveLength(2);
  });

  it("asks a range no more than twice when both answers are invalid", async () => {
    const range = answering(
      { kind: "invalid_answer" },
      { kind: "invalid_answer" },
      { kind: "read", rows: ["Yerba 1 kg"] },
    );

    expect(await askPriceListRange(range.ask)).toEqual({ kind: "invalid_answer" });
    expect(range.asked).toHaveLength(2);
  });

  it("keeps whatever the second answer is when the first was invalid", async () => {
    const range = answering({ kind: "invalid_answer" }, { kind: "too_long" });

    expect(await askPriceListRange(range.ask)).toEqual({ kind: "too_long" });
    expect(range.asked).toHaveLength(2);
  });

  it.each<RangeAnswer>([{ kind: "unavailable" }, { kind: "too_long" }, { kind: "unreadable" }])(
    "does not ask a range again when its answer is $kind",
    async (answer) => {
      const range = answering(answer, { kind: "read", rows: ["Yerba 1 kg"] });

      expect(await askPriceListRange(range.ask)).toEqual(answer);
      expect(range.asked).toHaveLength(1);
    },
  );
});
