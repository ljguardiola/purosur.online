import { describe, expect, it } from "vitest";
import { receiptPrintAvailability } from "./receipt-print-availability.js";

const ATTEMPTED_AT = new Date("2026-10-07T15:00:00.000Z");

describe("receiptPrintAvailability", () => {
  describe("a sale receipt", () => {
    it("allows printing the receipt of a sale that stands", () => {
      expect(
        receiptPrintAvailability(
          "sale_receipt",
          {
            voided: false,
            printAttemptedAt: null,
            reprintCount: 0,
            creditNoteAuthorized: false,
          },
          "print",
        ),
      ).toEqual({ kind: "available" });
    });

    it("allows a duplicate of a voided sale's receipt reprinted with a reason once its original was attempted", () => {
      expect(
        receiptPrintAvailability(
          "sale_receipt",
          {
            voided: true,
            printAttemptedAt: ATTEMPTED_AT,
            reprintCount: 0,
            creditNoteAuthorized: true,
          },
          "reprint_with_reason",
        ),
      ).toEqual({ kind: "available" });
    });

    it("refuses printing a voided sale's receipt without a reason, even once its original was attempted", () => {
      expect(
        receiptPrintAvailability(
          "sale_receipt",
          {
            voided: true,
            printAttemptedAt: ATTEMPTED_AT,
            reprintCount: 0,
            creditNoteAuthorized: true,
          },
          "print",
        ),
      ).toEqual({ kind: "sale_voided" });
    });

    it("refuses the original of a voided sale's receipt, even with its credit note authorized", () => {
      expect(
        receiptPrintAvailability(
          "sale_receipt",
          {
            voided: true,
            printAttemptedAt: null,
            reprintCount: 0,
            creditNoteAuthorized: true,
          },
          "reprint_with_reason",
        ),
      ).toEqual({ kind: "sale_voided" });
    });
  });

  describe("a deferred sale's invoice", () => {
    it("allows printing the invoice of a sale that stands", () => {
      expect(
        receiptPrintAvailability(
          "deferred_invoice",
          {
            voided: false,
            printAttemptedAt: ATTEMPTED_AT,
            reprintCount: 0,
            creditNoteAuthorized: false,
          },
          "print",
        ),
      ).toEqual({ kind: "available" });
    });

    it("refuses printing the invoice of a voided sale, even once it was attempted", () => {
      expect(
        receiptPrintAvailability(
          "deferred_invoice",
          {
            voided: true,
            printAttemptedAt: ATTEMPTED_AT,
            reprintCount: 0,
            creditNoteAuthorized: true,
          },
          "reprint_with_reason",
        ),
      ).toEqual({ kind: "sale_voided" });
    });
  });

  describe("a credit note", () => {
    it("allows printing a credit note the tax authority authorized", () => {
      expect(
        receiptPrintAvailability(
          "credit_note",
          {
            voided: true,
            printAttemptedAt: null,
            reprintCount: 0,
            creditNoteAuthorized: true,
          },
          "print",
        ),
      ).toEqual({ kind: "available" });
    });

    it("refuses printing a credit note that is not authorized, whether or not the sale is voided", () => {
      expect(
        receiptPrintAvailability(
          "credit_note",
          {
            voided: true,
            printAttemptedAt: null,
            reprintCount: 0,
            creditNoteAuthorized: false,
          },
          "print",
        ),
      ).toEqual({ kind: "credit_note_not_authorized" });
      expect(
        receiptPrintAvailability(
          "credit_note",
          {
            voided: false,
            printAttemptedAt: null,
            reprintCount: 0,
            creditNoteAuthorized: false,
          },
          "reprint_with_reason",
        ),
      ).toEqual({ kind: "credit_note_not_authorized" });
    });
  });
});
