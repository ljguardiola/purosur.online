import { describe, expect, it } from "vitest";
import {
  RECEIPT_PRINT_OFFER_MS,
  receiptPrintOfferDeadline,
  receiptPrintOfferLapsed,
  receiptPrintOfferRemainingMs,
} from "./receipt-print-offer.js";

const OFFERED_AT = new Date("2026-11-11T12:00:00.000Z");

function after(milliseconds: number): Date {
  return new Date(OFFERED_AT.getTime() + milliseconds);
}

describe("RECEIPT_PRINT_OFFER_MS", () => {
  it("offers to print the ticket for ten seconds", () => {
    expect(RECEIPT_PRINT_OFFER_MS).toBe(10_000);
  });
});

describe("receiptPrintOfferDeadline", () => {
  it("ends the offer the policy's length after it was made", () => {
    expect(receiptPrintOfferDeadline(OFFERED_AT)).toEqual(after(RECEIPT_PRINT_OFFER_MS));
  });
});

describe("receiptPrintOfferLapsed", () => {
  const deadline = receiptPrintOfferDeadline(OFFERED_AT);

  it("keeps the offer open before its deadline", () => {
    expect(receiptPrintOfferLapsed(deadline, after(RECEIPT_PRINT_OFFER_MS - 1))).toBe(false);
  });

  it("lapses the offer at its deadline", () => {
    expect(receiptPrintOfferLapsed(deadline, deadline)).toBe(true);
  });

  it("lapses the offer after its deadline", () => {
    expect(receiptPrintOfferLapsed(deadline, after(RECEIPT_PRINT_OFFER_MS + 1))).toBe(true);
  });
});

describe("receiptPrintOfferRemainingMs", () => {
  const deadline = receiptPrintOfferDeadline(OFFERED_AT);

  it("is the whole offer when it was just made", () => {
    expect(receiptPrintOfferRemainingMs(deadline, OFFERED_AT)).toBe(RECEIPT_PRINT_OFFER_MS);
  });

  it("is what is left before the deadline", () => {
    expect(receiptPrintOfferRemainingMs(deadline, after(1200))).toBe(RECEIPT_PRINT_OFFER_MS - 1200);
  });

  it("is zero at and after the deadline", () => {
    expect(receiptPrintOfferRemainingMs(deadline, deadline)).toBe(0);
    expect(receiptPrintOfferRemainingMs(deadline, after(RECEIPT_PRINT_OFFER_MS + 500))).toBe(0);
  });
});
