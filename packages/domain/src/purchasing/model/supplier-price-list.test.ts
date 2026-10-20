import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import {
  countsTowardDailyExtractionCap,
  currentConfirmedListId,
  DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP,
  dailyExtractionCapReached,
  decideConfirmation,
  isPriceListRowPrice,
  isSourcePage,
  isSupplierPriceListFileNameTooLong,
  isSupplierPriceListPdfTooLarge,
  SUPPLIER_PRICE_LIST_FILE_NAME_MAX_LENGTH,
  SUPPLIER_PRICE_LIST_PDF_MAX_BYTES,
  SUPPLIER_PRICE_LIST_READ_FAILURES,
  SUPPLIER_PRICE_LIST_SOURCE_KINDS,
  SUPPLIER_PRICE_LIST_STATES,
} from "./supplier-price-list.js";

describe("supplier price list constants", () => {
  it("names the states, source kinds and read failures", () => {
    expect(SUPPLIER_PRICE_LIST_STATES).toEqual([
      "READING",
      "READ_FAILED",
      "EXTRACTED",
      "REVIEWED",
      "DISCARDED",
    ]);
    expect(SUPPLIER_PRICE_LIST_SOURCE_KINDS).toEqual(["PDF", "WEB"]);
    expect(SUPPLIER_PRICE_LIST_READ_FAILURES).toEqual([
      "unreadable_document",
      "no_items_found",
      "reading_unavailable",
      "interrupted",
    ]);
  });

  it("caps a PDF at 20 MB and the daily extractions at 10 by default", () => {
    expect(SUPPLIER_PRICE_LIST_PDF_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP).toBe(10);
  });
});

describe("isSupplierPriceListPdfTooLarge", () => {
  it.each([0, 1, SUPPLIER_PRICE_LIST_PDF_MAX_BYTES])("accepts %s bytes", (bytes) => {
    expect(isSupplierPriceListPdfTooLarge(bytes)).toBe(false);
  });

  it("refuses one byte over the cap", () => {
    expect(isSupplierPriceListPdfTooLarge(SUPPLIER_PRICE_LIST_PDF_MAX_BYTES + 1)).toBe(true);
  });
});

describe("isSupplierPriceListFileNameTooLong", () => {
  it("allows a file name of 255 characters and refuses one more", () => {
    expect(SUPPLIER_PRICE_LIST_FILE_NAME_MAX_LENGTH).toBe(255);
    expect(isSupplierPriceListFileNameTooLong("a".repeat(255))).toBe(false);
    expect(isSupplierPriceListFileNameTooLong("a".repeat(256))).toBe(true);
  });

  it("counts characters, not UTF-16 units", () => {
    expect(isSupplierPriceListFileNameTooLong("🐟".repeat(255))).toBe(false);
    expect(isSupplierPriceListFileNameTooLong("🐟".repeat(256))).toBe(true);
  });
});

describe("countsTowardDailyExtractionCap", () => {
  const DAY = "2026-03-10";

  it.each(["READING", "READ_FAILED", "EXTRACTED", "REVIEWED", "DISCARDED"] as const)(
    "counts a %s extraction sent on the day",
    (state) => {
      expect(countsTowardDailyExtractionCap({ state, sentOn: DAY }, DAY)).toBe(true);
    },
  );

  it.each(["READ_FAILED", "EXTRACTED", "REVIEWED", "DISCARDED"] as const)(
    "does not count a %s extraction sent another day",
    (state) => {
      expect(countsTowardDailyExtractionCap({ state, sentOn: "2026-03-09" }, DAY)).toBe(false);
    },
  );

  it("counts a reading extraction not yet sent, because it will be sent", () => {
    expect(countsTowardDailyExtractionCap({ state: "READING", sentOn: null }, DAY)).toBe(true);
  });

  it("does not count a reading extraction sent another day", () => {
    expect(countsTowardDailyExtractionCap({ state: "READING", sentOn: "2026-03-09" }, DAY)).toBe(
      false,
    );
  });

  it.each(["READ_FAILED", "EXTRACTED", "REVIEWED", "DISCARDED"] as const)(
    "does not count a %s list that was never sent",
    (state) => {
      expect(countsTowardDailyExtractionCap({ state, sentOn: null }, DAY)).toBe(false);
    },
  );
});

describe("dailyExtractionCapReached", () => {
  it("is reached when the counted extractions equal or exceed the cap", () => {
    expect(dailyExtractionCapReached(9, 10)).toBe(false);
    expect(dailyExtractionCapReached(10, 10)).toBe(true);
    expect(dailyExtractionCapReached(11, 10)).toBe(true);
  });
});

describe("isPriceListRowPrice", () => {
  it.each([0, 1, 123_456, MAX_CASH_AMOUNT_CENTS])("accepts %s cents", (cents) => {
    expect(isPriceListRowPrice(cents)).toBe(true);
  });

  it.each([-1, 0.5, Number.NaN, MAX_CASH_AMOUNT_CENTS + 1])("refuses %s cents", (cents) => {
    expect(isPriceListRowPrice(cents)).toBe(false);
  });
});

describe("isSourcePage", () => {
  it.each([1, 2, 300])("accepts page %s", (page) => {
    expect(isSourcePage(page)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses page %s", (page) => {
    expect(isSourcePage(page)).toBe(false);
  });
});

describe("decideConfirmation", () => {
  const priced = [100, 250];

  it("confirms a priced list under the date it was read with", () => {
    expect(
      decideConfirmation({ rowPrices: priced, readListDate: "2026-03-01", typedListDate: null }),
    ).toEqual({ kind: "confirmable", listDate: "2026-03-01" });
  });

  it("takes the typed date over the read one", () => {
    expect(
      decideConfirmation({
        rowPrices: priced,
        readListDate: "2026-03-01",
        typedListDate: "2026-03-05",
      }),
    ).toEqual({ kind: "confirmable", listDate: "2026-03-05" });
  });

  it("takes the typed date when none was read", () => {
    expect(
      decideConfirmation({ rowPrices: priced, readListDate: null, typedListDate: "2026-03-05" }),
    ).toEqual({ kind: "confirmable", listDate: "2026-03-05" });
  });

  it("needs a date", () => {
    expect(
      decideConfirmation({ rowPrices: priced, readListDate: null, typedListDate: null }),
    ).toEqual({ kind: "refused", reason: "list_date_missing" });
  });

  it("needs at least one row", () => {
    expect(
      decideConfirmation({ rowPrices: [], readListDate: "2026-03-01", typedListDate: null }),
    ).toEqual({ kind: "refused", reason: "no_rows" });
  });

  it("refuses a list holding a row without price", () => {
    expect(
      decideConfirmation({
        rowPrices: [100, null],
        readListDate: "2026-03-01",
        typedListDate: null,
      }),
    ).toEqual({ kind: "refused", reason: "unpriced_rows" });
  });

  it("accepts a free row, priced at zero", () => {
    expect(
      decideConfirmation({ rowPrices: [0], readListDate: "2026-03-01", typedListDate: null }).kind,
    ).toBe("confirmable");
  });

  it("reports the missing rows before the unpriced ones before the missing date", () => {
    expect(decideConfirmation({ rowPrices: [], readListDate: null, typedListDate: null })).toEqual({
      kind: "refused",
      reason: "no_rows",
    });
    expect(
      decideConfirmation({ rowPrices: [null], readListDate: null, typedListDate: null }),
    ).toEqual({ kind: "refused", reason: "unpriced_rows" });
  });
});

describe("currentConfirmedListId", () => {
  const at = (iso: string) => new Date(iso);

  it("has none without confirmed lists", () => {
    expect(currentConfirmedListId([])).toBeNull();
  });

  it("is the only confirmed list", () => {
    expect(
      currentConfirmedListId([
        { id: "a", listDate: "2026-03-01", confirmedAt: at("2026-03-02T10:00:00Z") },
      ]),
    ).toBe("a");
  });

  it("is the one with the newest list date, whatever order they were confirmed in", () => {
    expect(
      currentConfirmedListId([
        { id: "old", listDate: "2026-02-01", confirmedAt: at("2026-03-09T10:00:00Z") },
        { id: "new", listDate: "2026-03-01", confirmedAt: at("2026-03-02T10:00:00Z") },
        { id: "mid", listDate: "2026-02-15", confirmedAt: at("2026-03-05T10:00:00Z") },
      ]),
    ).toBe("new");
  });

  it("breaks a tie of list dates by the later confirmation", () => {
    expect(
      currentConfirmedListId([
        { id: "first", listDate: "2026-03-01", confirmedAt: at("2026-03-02T10:00:00Z") },
        { id: "second", listDate: "2026-03-01", confirmedAt: at("2026-03-03T10:00:00Z") },
        { id: "third", listDate: "2026-03-01", confirmedAt: at("2026-03-02T12:00:00Z") },
      ]),
    ).toBe("second");
  });

  it("keeps the first of two lists with the same date confirmed at the same instant", () => {
    const sameInstant = new Date("2026-03-02T10:00:00Z");

    expect(
      currentConfirmedListId([
        { id: "first", listDate: "2026-03-01", confirmedAt: sameInstant },
        { id: "second", listDate: "2026-03-01", confirmedAt: new Date(sameInstant) },
      ]),
    ).toBe("first");
  });
});
