import { describe, expect, it } from "vitest";
import { receiptPrintAvailability } from "./receipt-print-availability.js";

describe("receiptPrintAvailability", () => {
  it("allows printing the receipt of a sale that stands", () => {
    expect(receiptPrintAvailability({ voided: false })).toEqual({ kind: "available" });
  });

  it("refuses printing the receipt of a voided sale", () => {
    expect(receiptPrintAvailability({ voided: true })).toEqual({ kind: "sale_voided" });
  });
});
