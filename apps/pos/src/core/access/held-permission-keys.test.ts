import { PERMISSION_KEYS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { heldPermissionKeys } from "./held-permission-keys";

describe("heldPermissionKeys", () => {
  it("gives an Administrator every permission", () => {
    expect(heldPermissionKeys({ isAdministrator: true, permissionKeys: [] })).toEqual([
      ...PERMISSION_KEYS,
    ]);
  });

  it("gives anyone else the permissions the role grants", () => {
    expect(
      heldPermissionKeys({ isAdministrator: false, permissionKeys: ["sell_and_charge"] }),
    ).toEqual(["sell_and_charge"]);
  });
});
