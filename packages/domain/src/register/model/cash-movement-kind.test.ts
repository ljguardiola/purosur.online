import { describe, expect, expectTypeOf, it } from "vitest";
import type { AuthorizablePermissionKey } from "../../permissions/index.js";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import {
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_REASON_MAX_LENGTH,
  type CashMovementKind,
  cashMovementPermission,
  cashMovementReason,
  isValidCashMovementAmount,
} from "./cash-movement-kind.js";
import type { CashMovementType } from "./cash-session.js";

describe("cashMovementPermission", () => {
  it("asks each kind of movement for its own permission", () => {
    expect(cashMovementPermission("CASH_IN")).toBe("record_cash_in");
    expect(cashMovementPermission("CASH_OUT")).toBe("record_cash_expense");
    expect(cashMovementPermission("WITHDRAWAL")).toBe("withdraw_cash");
  });

  it("only returns permissions another person's PIN can authorize", () => {
    expectTypeOf(cashMovementPermission).returns.toEqualTypeOf<AuthorizablePermissionKey>();
  });
});

describe("CASH_MOVEMENT_KINDS", () => {
  it("lists bringing cash in, paying an expense out and withdrawing cash", () => {
    expect(CASH_MOVEMENT_KINDS).toEqual(["CASH_IN", "CASH_OUT", "WITHDRAWAL"]);
  });

  it("are cash movement types a person records by hand", () => {
    expectTypeOf<CashMovementKind>().toExtend<CashMovementType>();
    expectTypeOf<"SALE">().not.toExtend<CashMovementKind>();
    expectTypeOf<"OPENING">().not.toExtend<CashMovementKind>();
  });
});

describe("cashMovementReason", () => {
  it("keeps the reason without the spaces around it", () => {
    expect(cashMovementReason("  Flete del proveedor \n")).toBe("Flete del proveedor");
  });

  it("refuses a reason that is empty once trimmed", () => {
    expect(cashMovementReason("")).toBeUndefined();
    expect(cashMovementReason(" \t\n ")).toBeUndefined();
  });

  it("accepts a reason of the maximum length, counted in characters", () => {
    const longest = `${"ñ".repeat(CASH_MOVEMENT_REASON_MAX_LENGTH - 1)}😀`;
    expect(cashMovementReason(longest)).toBe(longest);
  });

  it("refuses a reason one character longer than the maximum", () => {
    expect(cashMovementReason("a".repeat(CASH_MOVEMENT_REASON_MAX_LENGTH + 1))).toBeUndefined();
  });

  it("measures the length after trimming", () => {
    const reason = "a".repeat(CASH_MOVEMENT_REASON_MAX_LENGTH);
    expect(cashMovementReason(`  ${reason}  `)).toBe(reason);
  });
});

describe("isValidCashMovementAmount", () => {
  it.each([1, 500_000, MAX_CASH_AMOUNT_CENTS])("accepts %i cents", (cents) => {
    expect(isValidCashMovementAmount(cents)).toBe(true);
  });

  it.each([0, -1, 0.5, MAX_CASH_AMOUNT_CENTS + 1, Number.NaN])("refuses %d cents", (cents) => {
    expect(isValidCashMovementAmount(cents)).toBe(false);
  });
});
