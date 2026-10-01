import { describe, expect, it } from "vitest";
import type { RoleAccess } from "../../access/index.js";
import {
  mayAuthorize,
  REGISTER_ABILITIES,
  type RegisterOperation,
  registerAbilities,
  registerOperationAccess,
} from "./register-operation.js";

function holding(...permissionKeys: string[]): RoleAccess {
  return { isAdministrator: false, permissionKeys };
}

const ADMINISTRATOR: RoleAccess = { isAdministrator: true, permissionKeys: [] };
const NOBODY_HOLDS: RoleAccess = holding();
const SESSION = { openedBy: "ana" };

describe("registerOperationAccess", () => {
  describe.each<RegisterOperation>([{ kind: "open_cash_session" }, { kind: "sell" }])(
    "for $kind",
    (operation) => {
      it("permits a person who may sell and charge", () => {
        expect(
          registerOperationAccess(operation, { id: "ana", access: holding("sell_and_charge") }),
        ).toEqual({ kind: "permitted" });
      });

      it("permits an Administrator", () => {
        expect(registerOperationAccess(operation, { id: "ana", access: ADMINISTRATOR })).toEqual({
          kind: "permitted",
        });
      });

      it("refuses, with nobody able to authorize it, a person who may not sell and charge", () => {
        expect(
          registerOperationAccess(operation, { id: "ana", access: holding("record_cash_in") }),
        ).toEqual({ kind: "refused" });
      });

      it("refuses a person with no access", () => {
        expect(registerOperationAccess(operation, { id: "ana", access: undefined })).toEqual({
          kind: "refused",
        });
      });

      it("refuses when nobody is signed in", () => {
        expect(registerOperationAccess(operation, undefined)).toEqual({ kind: "refused" });
      });
    },
  );

  describe.each([
    { movement: "CASH_IN", permission: "record_cash_in" },
    { movement: "CASH_OUT", permission: "record_cash_expense" },
    { movement: "WITHDRAWAL", permission: "withdraw_cash" },
  ] as const)("for recording a $movement cash movement", ({ movement, permission }) => {
    const operation: RegisterOperation = { kind: "record_cash_movement", movement };

    it(`permits a person who holds ${permission}`, () => {
      expect(
        registerOperationAccess(operation, { id: "ana", access: holding(permission) }),
      ).toEqual({ kind: "permitted" });
    });

    it("permits an Administrator", () => {
      expect(registerOperationAccess(operation, { id: "ana", access: ADMINISTRATOR })).toEqual({
        kind: "permitted",
      });
    });

    it(`asks another person's authorization with ${permission} from a person who lacks it`, () => {
      expect(registerOperationAccess(operation, { id: "ana", access: NOBODY_HOLDS })).toEqual({
        kind: "needs_authorization",
        permission,
      });
    });

    it("asks another person's authorization from a person with no access", () => {
      expect(registerOperationAccess(operation, { id: "ana", access: undefined })).toEqual({
        kind: "needs_authorization",
        permission,
      });
    });

    it("refuses when nobody is signed in", () => {
      expect(registerOperationAccess(operation, undefined)).toEqual({ kind: "refused" });
    });
  });

  describe("for closing the open cash session", () => {
    const operation: RegisterOperation = { kind: "close_cash_session", session: SESSION };

    it("permits its opener, though they hold no permission", () => {
      expect(registerOperationAccess(operation, { id: "ana", access: NOBODY_HOLDS })).toEqual({
        kind: "permitted",
      });
    });

    it("permits its opener who no longer has any access", () => {
      expect(registerOperationAccess(operation, { id: "ana", access: undefined })).toEqual({
        kind: "permitted",
      });
    });

    it("refuses anyone else, even an Administrator", () => {
      expect(registerOperationAccess(operation, { id: "bruno", access: ADMINISTRATOR })).toEqual({
        kind: "refused",
      });
    });

    it("refuses when nobody is signed in", () => {
      expect(registerOperationAccess(operation, undefined)).toEqual({ kind: "refused" });
    });
  });

  describe("for closing a locked register", () => {
    const operation: RegisterOperation = { kind: "close_locked_register", session: SESSION };

    it("asks the authorization of a person who may close another person's session", () => {
      expect(registerOperationAccess(operation, undefined)).toEqual({
        kind: "needs_authorization",
        permission: "close_anothers_register_session",
      });
    });

    it("refuses while someone is signed in", () => {
      expect(registerOperationAccess(operation, { id: "bruno", access: ADMINISTRATOR })).toEqual({
        kind: "refused",
      });
    });
  });
});

describe("mayAuthorize", () => {
  describe("a cash movement", () => {
    const operation: RegisterOperation = { kind: "record_cash_movement", movement: "WITHDRAWAL" };

    it("accepts a person who holds the movement's permission", () => {
      expect(mayAuthorize(operation, { id: "bruno", access: holding("withdraw_cash") })).toBe(true);
    });

    it("accepts an Administrator", () => {
      expect(mayAuthorize(operation, { id: "bruno", access: ADMINISTRATOR })).toBe(true);
    });

    it("refuses a person who holds another movement's permission", () => {
      expect(mayAuthorize(operation, { id: "bruno", access: holding("record_cash_in") })).toBe(
        false,
      );
    });
  });

  describe("closing a locked register", () => {
    const operation: RegisterOperation = { kind: "close_locked_register", session: SESSION };
    const CLOSER = holding("close_anothers_register_session");

    it("accepts a person who may close another person's session", () => {
      expect(mayAuthorize(operation, { id: "bruno", access: CLOSER })).toBe(true);
    });

    it("refuses the person who opened the session, though they may close another's", () => {
      expect(mayAuthorize(operation, { id: "ana", access: CLOSER })).toBe(false);
    });

    it("refuses a person who may not close another person's session", () => {
      expect(mayAuthorize(operation, { id: "bruno", access: holding("sell_and_charge") })).toBe(
        false,
      );
    });

    it("accepts a person who may close another's session when no session is open", () => {
      expect(
        mayAuthorize(
          { kind: "close_locked_register", session: undefined },
          {
            id: "bruno",
            access: CLOSER,
          },
        ),
      ).toBe(true);
    });
  });

  it.each<RegisterOperation>([
    { kind: "open_cash_session" },
    { kind: "sell" },
    { kind: "close_cash_session", session: SESSION },
  ])("lets nobody authorize $kind for someone else", (operation) => {
    expect(mayAuthorize(operation, { id: "bruno", access: ADMINISTRATOR })).toBe(false);
  });
});

describe("registerAbilities", () => {
  it("gives an Administrator every ability", () => {
    expect(registerAbilities(ADMINISTRATOR)).toEqual([...REGISTER_ABILITIES]);
  });

  it("gives a person with no permission no ability", () => {
    expect(registerAbilities(NOBODY_HOLDS)).toEqual([]);
  });

  it("lets a person who may sell and charge open a cash session", () => {
    expect(registerAbilities(holding("sell_and_charge"))).toEqual(["open_cash_session"]);
  });

  it.each([
    "view_sales_history",
    "reprint_receipt",
    "correct_register_clock",
    "record_initial_inventory",
  ] as const)("gives the %s ability to a person who holds its permission", (key) => {
    expect(registerAbilities(holding(key))).toEqual([key]);
  });

  it("gives no ability for a permission the register does not use", () => {
    expect(registerAbilities(holding("view_stock_balances"))).toEqual([]);
  });
});
