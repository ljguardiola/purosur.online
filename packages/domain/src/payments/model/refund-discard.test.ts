import { describe, expect, it } from "vitest";
import { INSUFFICIENT_BALANCE_REFUSAL } from "./mercado-pago-refund.js";
import { isRefundDiscardable, refundDiscardRefusal } from "./refund-discard.js";

const CONFIRMED_AT = new Date("2026-10-13T14:00:00Z");
const FINAL_REFUSAL = "payment_not_refundable";

const CLOUD_REFUNDS = [
  ["QR", "sale_cancelled"],
  ["POINT", "sale_cancelled"],
  ["QR", "late_payment"],
  ["QR", "sale_voided"],
  ["POINT", "sale_voided"],
] as const;

function refund(
  method: string,
  origin: string,
  confirmedAt: Date | null,
  lastRefusalReason: string | null,
) {
  return { method, origin, confirmedAt, lastRefusalReason };
}

describe("refundDiscardRefusal", () => {
  it("refuses nothing for the refund of a late payment no person has confirmed", () => {
    expect(refundDiscardRefusal(refund("QR", "late_payment", null, null))).toBeNull();
  });

  it.each(CLOUD_REFUNDS)(
    "refuses nothing for a confirmed %s refund of origin %s Mercado Pago refused for good",
    (method, origin) => {
      expect(refundDiscardRefusal(refund(method, origin, CONFIRMED_AT, FINAL_REFUSAL))).toBeNull();
    },
  );

  it.each(CLOUD_REFUNDS)(
    "answers that a confirmed %s refund of origin %s held for insufficient balance is waiting for balance",
    (method, origin) => {
      expect(
        refundDiscardRefusal(refund(method, origin, CONFIRMED_AT, INSUFFICIENT_BALANCE_REFUSAL)),
      ).toBe("waiting_for_balance");
    },
  );

  it.each(CLOUD_REFUNDS)(
    "answers that a confirmed %s refund of origin %s Mercado Pago has not refused is already confirmed",
    (method, origin) => {
      expect(refundDiscardRefusal(refund(method, origin, CONFIRMED_AT, null))).toBe(
        "already_confirmed",
      );
    },
  );

  it.each(["sale_cancelled", "sale_voided"])(
    "answers that an unconfirmed %s refund is not discardable",
    (origin) => {
      expect(refundDiscardRefusal(refund("QR", origin, null, null))).toBe("not_discardable");
    },
  );
});

describe("isRefundDiscardable", () => {
  it("is true for the refund of a late payment no person has confirmed", () => {
    expect(isRefundDiscardable(refund("QR", "late_payment", null, null))).toBe(true);
  });

  it.each(CLOUD_REFUNDS)(
    "is true for a confirmed %s refund of origin %s Mercado Pago refused for good",
    (method, origin) => {
      expect(isRefundDiscardable(refund(method, origin, CONFIRMED_AT, FINAL_REFUSAL))).toBe(true);
    },
  );

  it("is false for a confirmed refund held for insufficient balance", () => {
    expect(
      isRefundDiscardable(refund("QR", "late_payment", CONFIRMED_AT, INSUFFICIENT_BALANCE_REFUSAL)),
    ).toBe(false);
  });

  it("is false for a confirmed refund Mercado Pago has not refused", () => {
    expect(isRefundDiscardable(refund("QR", "late_payment", CONFIRMED_AT, null))).toBe(false);
  });

  it.each(["sale_cancelled", "sale_voided"])("is false for an unconfirmed %s refund", (origin) => {
    expect(isRefundDiscardable(refund("QR", origin, null, null))).toBe(false);
  });
});
