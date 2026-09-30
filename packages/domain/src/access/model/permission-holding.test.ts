import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS } from "./permission-catalog.js";
import { holdsPermission } from "./permission-holding.js";

const permissionKey = fc.constantFrom(...PERMISSION_KEYS);

describe("holdsPermission", () => {
  it("holds a permission it was granted", () => {
    expect(
      holdsPermission(
        { isAdministrator: false, permissionKeys: ["void_sale", "sell_and_charge"] },
        "sell_and_charge",
      ),
    ).toBe(true);
  });

  it("does not hold a permission it was not granted", () => {
    expect(
      holdsPermission({ isAdministrator: false, permissionKeys: ["void_sale"] }, "sell_and_charge"),
    ).toBe(false);
  });

  it("lets an Administrator hold every permission", () => {
    fc.assert(
      fc.property(fc.subarray([...PERMISSION_KEYS]), permissionKey, (granted, key) => {
        expect(holdsPermission({ isAdministrator: true, permissionKeys: granted }, key)).toBe(true);
      }),
    );
  });

  it("holds exactly the permissions in the list when not an Administrator", () => {
    fc.assert(
      fc.property(fc.subarray([...PERMISSION_KEYS]), permissionKey, (granted, key) => {
        expect(holdsPermission({ isAdministrator: false, permissionKeys: granted }, key)).toBe(
          granted.includes(key),
        );
      }),
    );
  });
});
