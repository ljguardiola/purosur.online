import { PERMISSION_KEYS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { grantedPermissionKeys } from "./granted-permission-keys";

describe("grantedPermissionKeys", () => {
  it("gives an Administrator every permission", () => {
    expect(grantedPermissionKeys({ isAdministrator: true, permissionKeys: [] })).toEqual([
      ...PERMISSION_KEYS,
    ]);
  });

  it("gives anyone else the permissions the role grants", () => {
    expect(
      grantedPermissionKeys({ isAdministrator: false, permissionKeys: ["sell_and_charge"] }),
    ).toEqual(["sell_and_charge"]);
  });
});
