import { describe, expect, it } from "vitest";
import { nextReceiptCopy } from "./receipt-copy.js";

const ATTEMPTED_AT = new Date("2026-10-07T15:00:00.000Z");

describe("nextReceiptCopy", () => {
  it("is the original while no print was ever attempted", () => {
    expect(nextReceiptCopy({ printAttemptedAt: null, printedAt: null, reprintCount: 0 })).toEqual({
      kind: "original",
    });
  });

  it("is the first duplicate once a print was attempted", () => {
    expect(
      nextReceiptCopy({ printAttemptedAt: ATTEMPTED_AT, printedAt: null, reprintCount: 0 }),
    ).toEqual({ kind: "duplicate", orderNumber: 1 });
  });

  it("numbers each duplicate after the previous reprints of the sale", () => {
    expect(
      nextReceiptCopy({ printAttemptedAt: ATTEMPTED_AT, printedAt: ATTEMPTED_AT, reprintCount: 2 }),
    ).toEqual({ kind: "duplicate", orderNumber: 3 });
  });
});
