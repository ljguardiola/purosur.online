import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { grantedPermissionKeys, increasesAccess } from "./access-increase.js";
import { PERMISSION_KEYS } from "./permission-catalog.js";

const permissionKeys = fc.subarray([...PERMISSION_KEYS]);

describe("grantedPermissionKeys", () => {
  it("lists the permissions the new set holds that the previous one did not, in the new set's order", () => {
    expect(
      grantedPermissionKeys(["sell_and_charge"], ["void_sale", "sell_and_charge", "adjust_stock"]),
    ).toEqual(["void_sale", "adjust_stock"]);
  });

  it("lists nothing when the new set only drops permissions", () => {
    expect(grantedPermissionKeys(["sell_and_charge", "void_sale"], ["void_sale"])).toEqual([]);
  });
});

describe("increasesAccess", () => {
  it("increases access when someone is made Administrator, whatever they held before", () => {
    fc.assert(
      fc.property(permissionKeys, (before) => {
        expect(
          increasesAccess(
            { isAdministrator: false, permissionKeys: before },
            { isAdministrator: true, permissionKeys: [] },
          ),
        ).toBe(true);
      }),
    );
  });

  it("never increases access for an Administrator, who already holds every permission", () => {
    fc.assert(
      fc.property(fc.boolean(), permissionKeys, (afterIsAdministrator, after) => {
        expect(
          increasesAccess(
            { isAdministrator: true, permissionKeys: [] },
            { isAdministrator: afterIsAdministrator, permissionKeys: after },
          ),
        ).toBe(false);
      }),
    );
  });

  it("increases access when the new permissions include one the previous ones did not", () => {
    expect(
      increasesAccess(
        { isAdministrator: false, permissionKeys: ["sell_and_charge", "void_sale"] },
        { isAdministrator: false, permissionKeys: ["sell_and_charge", "adjust_stock"] },
      ),
    ).toBe(true);
  });

  it("never increases access when the new permissions are among the previous ones", () => {
    fc.assert(
      fc.property(permissionKeys, (before) => {
        fc.pre(before.length > 0);
        const after = before.slice(1);
        expect(
          increasesAccess(
            { isAdministrator: false, permissionKeys: before },
            { isAdministrator: false, permissionKeys: after },
          ),
        ).toBe(false);
      }),
    );
  });

  it("does not increase access when the permissions stay the same", () => {
    expect(
      increasesAccess(
        { isAdministrator: false, permissionKeys: ["sell_and_charge"] },
        { isAdministrator: false, permissionKeys: ["sell_and_charge"] },
      ),
    ).toBe(false);
  });
});
