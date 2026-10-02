import { describe, expect, it } from "vitest";
import { CASH_MOVEMENT_DIRECTIONS, cashMovementDirection } from "./cash-movement-direction.js";
import type { CashMovementType } from "./cash-session.js";
import { CASH_MOVEMENT_TYPES } from "./cash-session.js";

describe("cashMovementDirection", () => {
  it.each<CashMovementType>(["OPENING", "SALE", "CASH_IN"])("%s brings cash in", (type) => {
    expect(cashMovementDirection(type)).toBe("in");
  });

  it.each<CashMovementType>(["CHANGE", "REFUND", "CASH_OUT", "WITHDRAWAL"])(
    "%s takes cash out",
    (type) => {
      expect(cashMovementDirection(type)).toBe("out");
    },
  );

  it("CLOSING moves no cash", () => {
    expect(cashMovementDirection("CLOSING")).toBe("none");
  });

  it("answers one of the declared directions for every movement type", () => {
    for (const type of CASH_MOVEMENT_TYPES) {
      expect(CASH_MOVEMENT_DIRECTIONS).toContain(cashMovementDirection(type));
    }
  });
});
