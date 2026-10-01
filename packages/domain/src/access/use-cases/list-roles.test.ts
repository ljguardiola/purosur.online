import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS } from "../model/permission-catalog.js";
import { listRoles } from "./list-roles.js";
import { FakeRoleDirectory } from "./test-support/fake-role-directory.js";

describe("listRoles", () => {
  it("keeps the order the directory gives them", async () => {
    const roles = new FakeRoleDirectory();
    roles.seedRole({
      id: "r-admin",
      name: null,
      isAdministrator: true,
      version: 1,
      storedPermissionKeys: [],
      holders: [],
    });
    roles.seedRole({
      id: "r-1",
      name: "Cajero",
      isAdministrator: false,
      version: 1,
      storedPermissionKeys: [],
      holders: [],
    });

    const listed = await listRoles({ roles });

    expect(listed.map((role) => role.id)).toEqual(["r-admin", "r-1"]);
  });

  it("gives the Administrator role every permission whatever is stored", async () => {
    const roles = new FakeRoleDirectory();
    roles.seedRole({
      id: "r-admin",
      name: null,
      isAdministrator: true,
      version: 1,
      storedPermissionKeys: [],
      holders: [],
    });

    const [administrator] = await listRoles({ roles });

    expect(administrator?.permissionKeys).toEqual([...PERMISSION_KEYS]);
  });

  it("lists another role's permissions in catalog order, ignoring unknown keys", async () => {
    const roles = new FakeRoleDirectory();
    const [first, second] = PERMISSION_KEYS;
    if (!first || !second) {
      throw new Error("test setup: the catalog has fewer than two permissions");
    }
    roles.seedRole({
      id: "r-1",
      name: "Cajero",
      isAdministrator: false,
      version: 1,
      storedPermissionKeys: [second, "not_a_permission", first],
      holders: [],
    });

    const [role] = await listRoles({ roles });

    expect(role?.permissionKeys).toEqual([first, second]);
  });

  it("counts only active holders", async () => {
    const roles = new FakeRoleDirectory();
    roles.seedRole({
      id: "r-1",
      name: "Cajero",
      isAdministrator: false,
      version: 1,
      storedPermissionKeys: [],
      holders: [
        { id: "u-1", name: "Ana", active: true },
        { id: "u-2", name: "Beto", active: false },
      ],
    });

    const [role] = await listRoles({ roles });

    expect(role).toEqual({
      id: "r-1",
      name: "Cajero",
      isAdministrator: false,
      permissionKeys: [],
      userCount: 1,
    });
  });
});
