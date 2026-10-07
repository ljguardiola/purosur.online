import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { saleBalance } from "./sale-balance.js";

describe("saleBalance", () => {
  it("leaves the whole total pending when nothing was paid", () => {
    expect(saleBalance(5900, [])).toEqual({ paid: 0, pending: 5900 });
  });

  it("adds up the approved payments and leaves the rest pending", () => {
    expect(
      saleBalance(5900, [
        { amount: 2000, state: "APPROVED" },
        { amount: 1500, state: "APPROVED" },
      ]),
    ).toEqual({ paid: 3500, pending: 2400 });
  });

  it("leaves nothing pending when the approved payments cover the total", () => {
    expect(saleBalance(5900, [{ amount: 5900, state: "APPROVED" }])).toEqual({
      paid: 5900,
      pending: 0,
    });
  });

  it("ignores a payment that is not approved", () => {
    expect(
      saleBalance(5900, [
        { amount: 2000, state: "APPROVED" },
        { amount: 3000, state: "REJECTED" },
      ]),
    ).toEqual({ paid: 2000, pending: 3900 });
  });

  it("splits the total into what was paid and what is pending for every set of payments", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 10_000 }), { maxLength: 8 }),
        fc.integer({ min: 0, max: 10_000 }),
        (amounts, remaining) => {
          const paid = amounts.reduce((sum, amount) => sum + amount, 0);
          const balance = saleBalance(
            paid + remaining,
            amounts.map((amount) => ({ amount, state: "APPROVED" })),
          );
          expect(balance).toEqual({ paid, pending: remaining });
        },
      ),
    );
  });
});
