import { describe, expect, it } from "vitest";
import { listRoleHolders } from "./list-role-holders.js";
import { FakeRoleDirectory } from "./test-support/fake-role-directory.js";

describe("listRoleHolders", () => {
  it("lists the role's active holders", async () => {
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

    expect(await listRoleHolders({ roles }, { roleId: "r-1" })).toEqual([
      { id: "u-1", name: "Ana" },
    ]);
  });

  it("lists nobody for an unknown role", async () => {
    expect(await listRoleHolders({ roles: new FakeRoleDirectory() }, { roleId: "nope" })).toEqual(
      [],
    );
  });
});
