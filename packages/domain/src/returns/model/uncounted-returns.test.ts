import { describe, expect, it } from "vitest";
import { argentinaInstant, FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import type { SaleForReturn } from "./return-sale.js";
import { type LocalReturnOfSale, withUncountedReturns } from "./uncounted-returns.js";

function facts(): SaleForReturn {
  return {
    sale: {
      id: "sale-1",
      registerId: "register-1",
      deviceId: "device-1",
      sessionId: "session-1",
      actorId: "cashier",
      state: "COMPLETED",
      lines: [],
    },
    occurredAt: new Date(argentinaInstant("2026-09-12", "15:30", FIXED_ARGENTINA_ZONE_RULES)),
    invoice: null,
    payments: [
      {
        id: "pay-cash",
        method: "CASH",
        provider: "NONE",
        amount: 10_000,
        state: "APPROVED",
        refundedAmount: 1000,
        cardType: null,
      },
      {
        id: "pay-card",
        method: "TRANSFER",
        provider: "NONE",
        amount: 5000,
        state: "APPROVED",
        refundedAmount: 0,
        cardType: null,
      },
    ],
    returned: [{ saleLineId: "line-1", quantity: 1, refundedAmount: 1000 }],
  };
}

function localReturn(overrides: Partial<LocalReturnOfSale> = {}): LocalReturnOfSale {
  return {
    id: "return-local",
    lines: [{ saleLineId: "line-1", quantity: 2, refundedAmount: 2000 }],
    refunds: [{ paymentId: "pay-cash", amount: 2000 }],
    ...overrides,
  };
}

describe("withUncountedReturns", () => {
  it("leaves the facts as they are when the register made no return of the sale", () => {
    expect(withUncountedReturns(facts(), [], [])).toEqual(facts());
  });

  it("adds what an uncounted return took back to what the line already returned", () => {
    expect(withUncountedReturns(facts(), [], [localReturn()]).returned).toEqual([
      { saleLineId: "line-1", quantity: 3, refundedAmount: 3000 },
    ]);
  });

  it("adds a line no earlier return touched", () => {
    const returned = withUncountedReturns(
      facts(),
      [],
      [localReturn({ lines: [{ saleLineId: "line-2", quantity: 1, refundedAmount: 500 }] })],
    ).returned;

    expect(returned).toEqual([
      { saleLineId: "line-1", quantity: 1, refundedAmount: 1000 },
      { saleLineId: "line-2", quantity: 1, refundedAmount: 500 },
    ]);
  });

  it("adds what an uncounted return refunded to the payment it refunded", () => {
    expect(
      withUncountedReturns(facts(), [], [localReturn()]).payments.map(({ id, refundedAmount }) => [
        id,
        refundedAmount,
      ]),
    ).toEqual([
      ["pay-cash", 3000],
      ["pay-card", 0],
    ]);
  });

  it("adds every uncounted return", () => {
    const outcome = withUncountedReturns(
      facts(),
      [],
      [localReturn(), localReturn({ id: "return-local-2" })],
    );

    expect(outcome.returned).toEqual([{ saleLineId: "line-1", quantity: 5, refundedAmount: 5000 }]);
    expect(outcome.payments[0]?.refundedAmount).toBe(5000);
  });

  it("ignores a return the cloud already counted", () => {
    expect(withUncountedReturns(facts(), ["return-local"], [localReturn()])).toEqual(facts());
  });

  it("does not change the facts it is given", () => {
    const given = facts();

    withUncountedReturns(given, [], [localReturn()]);

    expect(given).toEqual(facts());
  });
});
