import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cashAfterMovement } from "./cash-after-movement.js";
import type { CashMovementKind } from "./cash-movement-kind.js";
import type { CashMovementType } from "./cash-session.js";

const OUT_KINDS: CashMovementKind[] = ["CASH_OUT", "WITHDRAWAL"];
const movements = [
  { type: "OPENING", amount: 10_000 },
  { type: "SALE", amount: 5_000 },
] satisfies { type: CashMovementType; amount: number }[];

describe("cashAfterMovement", () => {
  it("adds a cash in to the expected cash", () => {
    expect(cashAfterMovement(movements, { kind: "CASH_IN", amount: 2_000 })).toEqual({
      kind: "remaining",
      cash: 17_000,
    });
  });

  it.each(OUT_KINDS)("subtracts a %s from the expected cash", (kind) => {
    expect(cashAfterMovement(movements, { kind, amount: 2_000 })).toEqual({
      kind: "remaining",
      cash: 13_000,
    });
  });

  it.each(OUT_KINDS)("lets a %s take all the expected cash", (kind) => {
    expect(cashAfterMovement(movements, { kind, amount: 15_000 })).toEqual({
      kind: "remaining",
      cash: 0,
    });
  });

  it.each(OUT_KINDS)("refuses a %s above the expected cash", (kind) => {
    expect(cashAfterMovement(movements, { kind, amount: 15_001 })).toEqual({
      kind: "exceeds_expected_cash",
      expected: 15_000,
    });
  });

  it("lets a cash in go over the expected cash", () => {
    expect(cashAfterMovement([], { kind: "CASH_IN", amount: 500 })).toEqual({
      kind: "remaining",
      cash: 500,
    });
  });

  it("never answers a negative cash left", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<CashMovementKind>("CASH_IN", ...OUT_KINDS),
        fc.integer({ min: 1, max: 1_000_000 }),
        (kind, amount) => {
          const answer = cashAfterMovement(movements, { kind, amount });
          return answer.kind === "exceeds_expected_cash" || answer.cash >= 0;
        },
      ),
    );
  });
});
