import { describe, expect, it } from "vitest";
import { argentinaInstant, FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import type { SaleForReturn } from "./return-sale.js";
import {
  type LocalReturnOfSale,
  withReturnsOfBranch,
  withUncountedReturns,
} from "./uncounted-returns.js";

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

describe("withReturnsOfBranch", () => {
  function heldHere(): SaleForReturn {
    return {
      ...facts(),
      invoice: { pointOfSale: 3, number: 1204 },
      payments: facts().payments.map((payment) => ({ ...payment, refundedAmount: 0 })),
      returned: [],
    };
  }

  function knownToBranch(): SaleForReturn {
    return {
      ...facts(),
      invoice: null,
      returned: [
        { saleLineId: "line-1", quantity: 1, refundedAmount: 1000 },
        { saleLineId: "line-2", quantity: 2, refundedAmount: 800 },
      ],
    };
  }

  it("counts what the branch already returned from each line", () => {
    expect(withReturnsOfBranch(heldHere(), knownToBranch(), [], []).returned).toEqual([
      { saleLineId: "line-1", quantity: 1, refundedAmount: 1000 },
      { saleLineId: "line-2", quantity: 2, refundedAmount: 800 },
    ]);
  });

  it("counts what the branch already refunded from each payment", () => {
    expect(
      withReturnsOfBranch(heldHere(), knownToBranch(), [], []).payments.map(
        ({ id, refundedAmount }) => [id, refundedAmount],
      ),
    ).toEqual([
      ["pay-cash", 1000],
      ["pay-card", 0],
    ]);
  });

  it("adds the returns this register made that the branch did not count", () => {
    const outcome = withReturnsOfBranch(heldHere(), knownToBranch(), [], [localReturn()]);

    expect(outcome.returned[0]).toEqual({
      saleLineId: "line-1",
      quantity: 3,
      refundedAmount: 3000,
    });
    expect(outcome.payments[0]?.refundedAmount).toBe(3000);
  });

  it("does not add a return of this register the branch already counted", () => {
    const outcome = withReturnsOfBranch(
      heldHere(),
      knownToBranch(),
      ["return-local"],
      [localReturn()],
    );

    expect(outcome.returned[0]).toEqual({
      saleLineId: "line-1",
      quantity: 1,
      refundedAmount: 1000,
    });
    expect(outcome.payments[0]?.refundedAmount).toBe(1000);
  });

  it("keeps the sale, its date, its invoice and its payments as this register holds them", () => {
    const here = heldHere();
    here.payments = here.payments.map((payment) =>
      payment.id === "pay-cash" ? { ...payment, state: "PENDING" } : payment,
    );

    const outcome = withReturnsOfBranch(here, knownToBranch(), [], []);

    expect(outcome.sale).toEqual(here.sale);
    expect(outcome.occurredAt).toEqual(here.occurredAt);
    expect(outcome.invoice).toEqual({ pointOfSale: 3, number: 1204 });
    expect(outcome.payments.map(({ id, state }) => [id, state])).toEqual([
      ["pay-cash", "PENDING"],
      ["pay-card", "APPROVED"],
    ]);
  });

  it("keeps what this register refunded from a payment the branch does not know", () => {
    const here = heldHere();
    here.payments = here.payments.map((payment) =>
      payment.id === "pay-card" ? { ...payment, refundedAmount: 700 } : payment,
    );
    const branch = knownToBranch();
    branch.payments = branch.payments.filter(({ id }) => id !== "pay-card");

    expect(withReturnsOfBranch(here, branch, [], []).payments[1]?.refundedAmount).toBe(700);
  });

  it("does not change the facts it is given", () => {
    const here = heldHere();
    const branch = knownToBranch();

    withReturnsOfBranch(here, branch, [], [localReturn()]);

    expect(here).toEqual(heldHere());
    expect(branch).toEqual(knownToBranch());
  });
});
