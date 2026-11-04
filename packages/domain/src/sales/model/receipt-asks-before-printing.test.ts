import { describe, expect, it } from "vitest";
import { receiptAsksBeforePrinting, receiptAwaitsAnswer } from "./receipt-asks-before-printing.js";

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

describe("receiptAwaitsAnswer", () => {
  it("waits for the cashier's answer on a factura C never sent to the printer", () => {
    expect(receiptAwaitsAnswer("never_printed", { invoiceClass: "C" })).toBe(true);
  });

  it.each(["outcome_unknown", "printed", "declined"] as const)(
    "does not wait on a factura C whose print stands %s",
    (standing) => {
      expect(receiptAwaitsAnswer(standing, { invoiceClass: "C" })).toBe(false);
    },
  );

  it("does not wait on a receipt that always prints", () => {
    expect(receiptAwaitsAnswer("never_printed", { invoiceClass: "X" })).toBe(false);
    expect(receiptAwaitsAnswer("never_printed", null)).toBe(false);
  });
});
