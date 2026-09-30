import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type AuthorizablePermissionKey,
  holdsPermission,
  isAuthorizablePermissionKey,
} from "./holds-permission.js";
import { PERMISSION_CATALOG, PERMISSION_KEYS, type PermissionKey } from "./permission-catalog.js";

const permissionKey = fc.constantFrom(...PERMISSION_KEYS);

describe("holdsPermission", () => {
  it("holds every permission when the person is an administrator", () => {
    fc.assert(
      fc.property(permissionKey, fc.array(permissionKey), (key, held) => {
        expect(holdsPermission({ isAdministrator: true, permissionKeys: held }, key)).toBe(true);
      }),
    );
  });

  it("holds a permission the role includes", () => {
    expect(
      holdsPermission(
        { isAdministrator: false, permissionKeys: ["sell_and_charge", "void_sale"] },
        "void_sale",
      ),
    ).toBe(true);
  });

  it("does not hold a permission the role leaves out", () => {
    expect(
      holdsPermission({ isAdministrator: false, permissionKeys: ["sell_and_charge"] }, "void_sale"),
    ).toBe(false);
  });

  it("holds nothing without a role", () => {
    fc.assert(
      fc.property(permissionKey, (key) => {
        expect(holdsPermission({ isAdministrator: false, permissionKeys: [] }, key)).toBe(false);
      }),
    );
  });
});

describe("AuthorizablePermissionKey", () => {
  it("covers exactly the permissions the catalog lets another person's PIN authorize", () => {
    const authorizable = PERMISSION_CATALOG.filter(
      (definition) => definition.registerMarker === "register_with_another_persons_pin",
    ).map((definition) => definition.key);

    expect(authorizable).toContain("record_cash_in");
    expectTypeOf<"record_cash_in">().toExtend<AuthorizablePermissionKey>();
    expectTypeOf<"void_sale">().toExtend<AuthorizablePermissionKey>();
    expectTypeOf<AuthorizablePermissionKey>().toExtend<PermissionKey>();
  });

  it("leaves out a permission a person must hold personally", () => {
    expectTypeOf<"sell_and_charge">().not.toExtend<AuthorizablePermissionKey>();
    expectTypeOf<"adjust_stock">().not.toExtend<AuthorizablePermissionKey>();
  });
});

describe("isAuthorizablePermissionKey", () => {
  it("accepts exactly the permissions the catalog lets another person's PIN authorize", () => {
    for (const definition of PERMISSION_CATALOG) {
      expect(isAuthorizablePermissionKey(definition.key)).toBe(
        definition.registerMarker === "register_with_another_persons_pin",
      );
    }
  });

  it("refuses what is not a permission key", () => {
    expect(isAuthorizablePermissionKey("open_the_safe")).toBe(false);
    expect(isAuthorizablePermissionKey(undefined)).toBe(false);
    expect(isAuthorizablePermissionKey(7)).toBe(false);
  });
});
