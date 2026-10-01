import { describe, expect, it } from "vitest";
import { isRoleEditable } from "./role-editability.js";

describe("isRoleEditable", () => {
  it("lets any role but the Administrator role be edited", () => {
    expect(isRoleEditable({ isAdministrator: false })).toBe(true);
    expect(isRoleEditable({ isAdministrator: true })).toBe(false);
  });
});
