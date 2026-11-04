import { describe, expect, it } from "vitest";
import { receiptAsksBeforePrinting } from "./receipt-asks-before-printing.js";

describe("receiptAsksBeforePrinting", () => {
  it("is true for the customer's factura C", () => {
    expect(receiptAsksBeforePrinting({ invoiceClass: "C" })).toBe(true);
  });

  it("is false for the deferred sale's non-fiscal document, which always prints", () => {
    expect(receiptAsksBeforePrinting({ invoiceClass: "X" })).toBe(false);
  });

  it("is false for a receipt with no fiscal document", () => {
    expect(receiptAsksBeforePrinting(null)).toBe(false);
  });
});
