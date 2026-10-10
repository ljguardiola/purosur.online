import { describe, expect, it } from "vitest";
import {
  hasPurchaseLines,
  hasValidReceiptNumber,
  isLotNumberTooLong,
  isPurchaseDateInFuture,
  isPurchaseNoteTooLong,
  isReceiptNumberTooLong,
  isReceiptType,
  LOT_NUMBER_MAX_LENGTH,
  PURCHASE_NOTE_MAX_LENGTH,
  RECEIPT_NUMBER_MAX_LENGTH,
  RECEIPT_TYPES,
} from "./purchase.js";

describe("RECEIPT_TYPES", () => {
  it("lists the supplier's receipts a purchase can come with, ending with the absence of one", () => {
    expect(RECEIPT_TYPES).toEqual([
      "factura_b",
      "factura_c",
      "remito",
      "ticket",
      "otro",
      "sin_comprobante",
    ]);
  });
});

describe("isReceiptType", () => {
  it.each(RECEIPT_TYPES)("accepts %s", (type) => {
    expect(isReceiptType(type)).toBe(true);
  });

  it.each(["", "factura_a", "Remito", "sin comprobante"])("rejects %j", (type) => {
    expect(isReceiptType(type)).toBe(false);
  });
});

describe("hasValidReceiptNumber", () => {
  it.each(["factura_b", "factura_c", "remito", "ticket", "otro"] as const)(
    "requires a number for a %s",
    (type) => {
      expect(hasValidReceiptNumber(type, "0001-00001234")).toBe(true);
      expect(hasValidReceiptNumber(type, null)).toBe(false);
    },
  );

  it("takes no number when there is no receipt", () => {
    expect(hasValidReceiptNumber("sin_comprobante", null)).toBe(true);
    expect(hasValidReceiptNumber("sin_comprobante", "0001-00001234")).toBe(false);
  });
});

describe("purchase text limits", () => {
  it("allows a receipt number and a lot number of up to 50 characters and a note of up to 200", () => {
    expect(RECEIPT_NUMBER_MAX_LENGTH).toBe(50);
    expect(LOT_NUMBER_MAX_LENGTH).toBe(50);
    expect(PURCHASE_NOTE_MAX_LENGTH).toBe(200);
  });

  it.each([
    ["receipt number", isReceiptNumberTooLong, RECEIPT_NUMBER_MAX_LENGTH],
    ["lot number", isLotNumberTooLong, LOT_NUMBER_MAX_LENGTH],
    ["note", isPurchaseNoteTooLong, PURCHASE_NOTE_MAX_LENGTH],
  ])(
    "accepts a %s of exactly its limit and rejects one character more",
    (_field, isTooLong, limit) => {
      expect(isTooLong("a".repeat(limit))).toBe(false);
      expect(isTooLong("a".repeat(limit + 1))).toBe(true);
    },
  );

  it("counts a character outside the basic plane once", () => {
    expect(isLotNumberTooLong("😀".repeat(LOT_NUMBER_MAX_LENGTH))).toBe(false);
  });
});

describe("hasPurchaseLines", () => {
  it("needs at least one line", () => {
    expect(hasPurchaseLines(0)).toBe(false);
    expect(hasPurchaseLines(1)).toBe(true);
    expect(hasPurchaseLines(30)).toBe(true);
  });
});

describe("isPurchaseDateInFuture", () => {
  it("accepts today in Argentina and any earlier day", () => {
    const now = new Date("2026-03-10T15:00:00Z");
    expect(isPurchaseDateInFuture("2026-03-10", now)).toBe(false);
    expect(isPurchaseDateInFuture("2026-03-09", now)).toBe(false);
    expect(isPurchaseDateInFuture("2020-01-01", now)).toBe(false);
  });

  it("refuses the day after today in Argentina", () => {
    expect(isPurchaseDateInFuture("2026-03-11", new Date("2026-03-10T15:00:00Z"))).toBe(true);
    expect(isPurchaseDateInFuture("2027-01-01", new Date("2026-03-10T15:00:00Z"))).toBe(true);
  });

  it("takes today from Argentina's calendar, not UTC's", () => {
    const lateEvening = new Date("2026-03-11T01:30:00Z");
    expect(isPurchaseDateInFuture("2026-03-10", lateEvening)).toBe(false);
    expect(isPurchaseDateInFuture("2026-03-11", lateEvening)).toBe(true);
  });
});
