import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOG, PERMISSION_KEYS } from "./permission-catalog.js";
import { holdsARegisterPermission, uncoveredRegisterPermissions } from "./register-coverage.js";

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

describe("holdsARegisterPermission", () => {
  it("holds one for an Administrator, who holds every permission", () => {
    fc.assert(
      fc.property(fc.subarray([...PERMISSION_KEYS]), (held) => {
        expect(holdsARegisterPermission({ isAdministrator: true, permissionKeys: held })).toBe(
          true,
        );
      }),
    );
  });

  it("holds one when any held permission is used by the register", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...registerPermissionKeys),
        fc.subarray([...PERMISSION_KEYS]),
        (registerKey, others) => {
          expect(
            holdsARegisterPermission({
              isAdministrator: false,
              permissionKeys: [...others, registerKey],
            }),
          ).toBe(true);
        },
      ),
    );
  });

  it("holds none when only permissions used outside the register are held", () => {
    const outsideTheRegister = PERMISSION_KEYS.filter(
      (key) => !registerPermissionKeys.includes(key),
    );

    fc.assert(
      fc.property(fc.subarray(outsideTheRegister), (held) => {
        expect(holdsARegisterPermission({ isAdministrator: false, permissionKeys: held })).toBe(
          false,
        );
      }),
    );
  });

  it("ignores keys the catalog does not know", () => {
    expect(
      holdsARegisterPermission({ isAdministrator: false, permissionKeys: ["not_a_permission"] }),
    ).toBe(false);
  });
});
