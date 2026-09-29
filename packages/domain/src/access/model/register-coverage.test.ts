import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOG, PERMISSION_KEYS } from "./permission-catalog.js";
import { uncoveredRegisterPermissions } from "./register-coverage.js";

const registerPermissionKeys = PERMISSION_CATALOG.filter(
  (definition) => definition.registerMarker !== "none",
).map((definition) => definition.key);

describe("uncoveredRegisterPermissions", () => {
  it("lists every register permission, in the catalog's order, when nobody holds any permission", () => {
    expect(uncoveredRegisterPermissions([])).toEqual([
      "sell_and_charge",
      "view_sales_history",
      "close_anothers_register_session",
      "reprint_receipt",
      "record_cash_in",
      "record_cash_expense",
      "withdraw_cash",
      "override_line_price_or_discount",
      "apply_total_discount",
      "void_sale",
      "process_return",
      "authorize_late_defect_refund",
      "confirm_refunds",
      "record_initial_inventory",
      "correct_register_clock",
    ]);
  });

  it("leaves out the register permissions someone holds", () => {
    const heldByEveryoneButVoidAndClock = registerPermissionKeys.filter(
      (key) => key !== "void_sale" && key !== "correct_register_clock",
    );

    expect(uncoveredRegisterPermissions(heldByEveryoneButVoidAndClock)).toEqual([
      "void_sale",
      "correct_register_clock",
    ]);
  });

  it("lists nothing once every register permission is held, whatever else is held", () => {
    fc.assert(
      fc.property(fc.subarray([...PERMISSION_KEYS]), (others) => {
        expect(uncoveredRegisterPermissions([...others, ...registerPermissionKeys])).toEqual([]);
      }),
    );
  });

  it("never lists a permission used only outside the register", () => {
    fc.assert(
      fc.property(fc.subarray([...PERMISSION_KEYS]), (held) => {
        for (const key of uncoveredRegisterPermissions(held)) {
          expect(registerPermissionKeys).toContain(key);
        }
      }),
    );
  });
});
