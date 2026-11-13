import { describe, expect, it } from "vitest";
import { nextReceiptCopy, type ReceiptDelivery } from "./receipt-copy.js";

const ATTEMPTED_AT = new Date("2026-10-07T15:00:00.000Z");

function delivery(overrides: Partial<ReceiptDelivery>): ReceiptDelivery {
  return {
    printAttemptedAt: null,
    printedAt: null,
    printDeclinedAt: null,
    reprintCount: 0,
    voided: false,
    creditNoteAuthorized: false,
    ...overrides,
  };
}

describe("nextReceiptCopy", () => {
  it("is the original while no print was ever attempted", () => {
    expect(nextReceiptCopy(delivery({}))).toEqual({
      kind: "original",
    });
  });

  it("is the original while the cashier only declined the print", () => {
    expect(nextReceiptCopy(delivery({ printDeclinedAt: ATTEMPTED_AT }))).toEqual({
      kind: "original",
    });
  });

  it("is the first duplicate once a print was attempted", () => {
    expect(nextReceiptCopy(delivery({ printAttemptedAt: ATTEMPTED_AT }))).toEqual({
      kind: "duplicate",
      orderNumber: 1,
    });
  });

  it("numbers each duplicate after the previous reprints of the sale", () => {
    expect(
      nextReceiptCopy(
        delivery({ printAttemptedAt: ATTEMPTED_AT, printedAt: ATTEMPTED_AT, reprintCount: 2 }),
      ),
    ).toEqual({ kind: "duplicate", orderNumber: 3 });
  });
});
