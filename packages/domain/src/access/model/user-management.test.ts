import { describe, expect, it } from "vitest";
import {
  mayDeactivateUser,
  mayEditUser,
  mayReactivateUser,
  mayRemovePasskeyOf,
  mayRemoveUserPasskey,
} from "./user-management.js";

const ADMINISTRATOR = { id: "actor", isAdministrator: true, permissionKeys: [] };
const NO_PERMISSION = { id: "actor", isAdministrator: false, permissionKeys: [] };

function holding(...permissionKeys: string[]) {
  return { id: "actor", isAdministrator: false, permissionKeys };
}

describe("mayEditUser", () => {
  it("lets an administrator edit an active user", () => {
    expect(mayEditUser(ADMINISTRATOR, { active: true })).toBe(true);
  });

  it("refuses an inactive user", () => {
    expect(mayEditUser(ADMINISTRATOR, { active: false })).toBe(false);
  });

  it("refuses a person who is not an administrator, whatever permission they hold", () => {
    expect(
      mayEditUser(
        holding("deactivate_users", "reactivate_users", "reset_user_pin", "configure_branch"),
        { active: true },
      ),
    ).toBe(false);
    expect(mayEditUser(NO_PERMISSION, { active: true })).toBe(false);
  });
});

describe("mayRemovePasskeyOf", () => {
  it("allows removing the passkey of another user", () => {
    expect(mayRemovePasskeyOf("actor", { id: "other" })).toBe(true);
  });

  it("refuses removing one's own passkey", () => {
    expect(mayRemovePasskeyOf("actor", { id: "actor" })).toBe(false);
  });
});

describe("mayRemoveUserPasskey", () => {
  it("lets an administrator remove the passkey of another active user", () => {
    expect(mayRemoveUserPasskey(ADMINISTRATOR, { id: "other", active: true })).toBe(true);
  });

  it("refuses an inactive user", () => {
    expect(mayRemoveUserPasskey(ADMINISTRATOR, { id: "other", active: false })).toBe(false);
  });

  it("refuses the administrator's own account", () => {
    expect(mayRemoveUserPasskey(ADMINISTRATOR, { id: "actor", active: true })).toBe(false);
  });

  it("refuses a person who is not an administrator", () => {
    expect(mayRemoveUserPasskey(holding("reset_user_pin"), { id: "other", active: true })).toBe(
      false,
    );
  });
});

describe("mayDeactivateUser", () => {
  const OTHER_ACTIVE = { id: "other", isAdministrator: false, active: true };

  it("lets a person holding deactivate_users deactivate another active user", () => {
    expect(mayDeactivateUser(holding("deactivate_users"), OTHER_ACTIVE)).toBe(true);
  });

  it("lets an administrator deactivate another active user", () => {
    expect(mayDeactivateUser(ADMINISTRATOR, OTHER_ACTIVE)).toBe(true);
  });

  it("refuses an inactive user", () => {
    expect(mayDeactivateUser(ADMINISTRATOR, { ...OTHER_ACTIVE, active: false })).toBe(false);
  });

  it("refuses a person without deactivate_users", () => {
    expect(mayDeactivateUser(holding("reactivate_users", "reset_user_pin"), OTHER_ACTIVE)).toBe(
      false,
    );
  });

  it("refuses an administrator target", () => {
    expect(mayDeactivateUser(ADMINISTRATOR, { ...OTHER_ACTIVE, isAdministrator: true })).toBe(
      false,
    );
  });

  it("refuses the person's own account", () => {
    expect(mayDeactivateUser(ADMINISTRATOR, { ...OTHER_ACTIVE, id: "actor" })).toBe(false);
  });
});

describe("mayReactivateUser", () => {
  it("lets a person holding reactivate_users reactivate an inactive user", () => {
    expect(mayReactivateUser(holding("reactivate_users"), { active: false })).toBe(true);
  });

  it("lets an administrator reactivate an inactive user", () => {
    expect(mayReactivateUser(ADMINISTRATOR, { active: false })).toBe(true);
  });

  it("refuses an active user", () => {
    expect(mayReactivateUser(ADMINISTRATOR, { active: true })).toBe(false);
  });

  it("refuses a person without reactivate_users", () => {
    expect(mayReactivateUser(holding("deactivate_users"), { active: false })).toBe(false);
  });
});
