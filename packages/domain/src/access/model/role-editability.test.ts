import { describe, expect, it } from "vitest";
import { editableRoleDetail, isRoleEditable } from "./role-editability.js";

describe("isRoleEditable", () => {
  it("lets any role but the Administrator role be edited", () => {
    expect(isRoleEditable({ isAdministrator: false })).toBe(true);
    expect(isRoleEditable({ isAdministrator: true })).toBe(false);
  });
});

describe("editableRoleDetail", () => {
  it("answers the role with its permissions in catalog order and its holders as its users", () => {
    const holders = [
      { id: "u-1", name: "Ana" },
      { id: "u-2", name: "Beto" },
    ];

    expect(
      editableRoleDetail(
        {
          id: "r-1",
          name: "Cajero",
          version: 4,
          storedPermissionKeys: ["void_sale", "open_the_safe", "sell_and_charge"],
        },
        holders,
      ),
    ).toEqual({
      id: "r-1",
      name: "Cajero",
      isAdministrator: false,
      permissionKeys: ["sell_and_charge", "void_sale"],
      userCount: 2,
      version: 4,
      assignedUsers: holders,
    });
  });

  it("counts no users for a role nobody holds", () => {
    expect(
      editableRoleDetail({ id: "r-1", name: null, version: 1, storedPermissionKeys: [] }, []),
    ).toMatchObject({ permissionKeys: [], userCount: 0, assignedUsers: [] });
  });
});
