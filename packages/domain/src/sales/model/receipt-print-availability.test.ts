import { describe, expect, it } from "vitest";
import { receiptPrintAvailability } from "./receipt-print-availability.js";

describe("receiptPrintAvailability", () => {
  describe("a sale receipt", () => {
    it("allows printing the receipt of a sale that stands", () => {
      expect(
        receiptPrintAvailability("sale_receipt", { voided: false, creditNoteAuthorized: false }),
      ).toEqual({ kind: "available" });
    });

    it("refuses printing the receipt of a voided sale, even with its credit note authorized", () => {
      expect(
        receiptPrintAvailability("sale_receipt", { voided: true, creditNoteAuthorized: true }),
      ).toEqual({ kind: "sale_voided" });
    });
  });

  describe("a credit note", () => {
    it("allows printing a credit note the tax authority authorized", () => {
      expect(
        receiptPrintAvailability("credit_note", { voided: true, creditNoteAuthorized: true }),
      ).toEqual({ kind: "available" });
    });

    it("refuses printing a credit note that is not authorized, whether or not the sale is voided", () => {
      expect(
        receiptPrintAvailability("credit_note", { voided: true, creditNoteAuthorized: false }),
      ).toEqual({ kind: "credit_note_not_authorized" });
      expect(
        receiptPrintAvailability("credit_note", { voided: false, creditNoteAuthorized: false }),
      ).toEqual({ kind: "credit_note_not_authorized" });
    });
  });
});
