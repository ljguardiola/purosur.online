import { describe, expect, it } from "vitest";
import { refundDraftFor, refundsOf } from "./return-refunds";
import { CASH, TRANSFER } from "./test-support/sale-for-return";

const OTHER_CASH = { ...CASH, payment_id: "pay-cash-2", amount: 500_000, remaining: 500_000 };

describe("the refund shown for each payment", () => {
  it("puts all the refundable total in the first payment that can be refunded", () => {
    expect(refundDraftFor([TRANSFER, OTHER_CASH, CASH], 1_393_500, {})).toEqual([
      { payment: TRANSFER, text: "", cents: 0 },
      { payment: OTHER_CASH, text: "13.935,00", cents: 1_393_500 },
      { payment: CASH, text: "", cents: 0 },
    ]);
  });

  it("puts nothing in any payment while there is nothing to refund", () => {
    expect(refundDraftFor([CASH], 0, {}).map(({ cents }) => cents)).toEqual([0]);
  });

  it("takes what the cashier typed instead, read as an amount", () => {
    const draft = refundDraftFor([CASH, OTHER_CASH], 1_000_000, {
      [CASH.payment_id]: "6.000,00",
      [OTHER_CASH.payment_id]: "4.000,50",
    });

    expect(draft.map(({ text, cents }) => [text, cents])).toEqual([
      ["6.000,00", 600_000],
      ["4.000,50", 400_050],
    ]);
  });

  it("counts for nothing an amount that is typed badly", () => {
    const draft = refundDraftFor([CASH], 1_000_000, { [CASH.payment_id]: "diez" });

    expect(draft).toEqual([{ payment: CASH, text: "diez", cents: 0 }]);
  });

  it("lets the cashier empty the payment that was filled in", () => {
    const draft = refundDraftFor([CASH], 1_000_000, { [CASH.payment_id]: "" });

    expect(draft).toEqual([{ payment: CASH, text: "", cents: 0 }]);
  });
});

describe("the refunds asked of the core", () => {
  it("are the payments with something to refund", () => {
    const draft = refundDraftFor([CASH, OTHER_CASH], 1_000_000, {
      [OTHER_CASH.payment_id]: "100,00",
      [CASH.payment_id]: "0",
    });

    expect(refundsOf(draft)).toEqual([{ payment_id: OTHER_CASH.payment_id, amount: 10_000 }]);
  });
});
