import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS } from "../model/permission-catalog.js";
import { findEditableRole } from "./find-editable-role.js";
import { FakeRoleDirectory } from "./test-support/fake-role-directory.js";

describe("findEditableRole", () => {
  it("finds a role with its version and permissions in catalog order", async () => {
    const roles = new FakeRoleDirectory();
    const [first, second] = PERMISSION_KEYS;
    if (!first || !second) {
      throw new Error("test setup: the catalog has fewer than two permissions");
    }
    roles.seedRole({
      id: "r-1",
      name: "Cajero",
      isAdministrator: false,
      version: 4,
      storedPermissionKeys: [second, first],
      holders: [],
    });

    const found = await findEditableRole({ roles }, { roleId: "r-1" });

    expect(found).toEqual({
      id: "r-1",
      name: "Cajero",
      version: 4,
      permissionKeys: [first, second],
    });
  });

  it("finds nothing for the Administrator role, which nobody can edit", async () => {
    const roles = new FakeRoleDirectory();
    roles.seedRole({
      id: "r-admin",
      name: null,
      isAdministrator: true,
      version: 1,
      storedPermissionKeys: [],
      holders: [],
    });

    expect(await findEditableRole({ roles }, { roleId: "r-admin" })).toBeUndefined();
  });

  it("finds nothing for an unknown role", async () => {
    expect(
      await findEditableRole({ roles: new FakeRoleDirectory() }, { roleId: "nope" }),
    ).toBeUndefined();
  });
});
