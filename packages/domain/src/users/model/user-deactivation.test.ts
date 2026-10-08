import { describe, expect, it } from "vitest";
import { isUserDeactivatable, isUserReactivatable } from "./user-deactivation.js";

describe("isUserDeactivatable", () => {
  it("lets someone else without the Administrator role, who is active, be deactivated", () => {
    expect(
      isUserDeactivatable({ id: "u-2", holdsAdministratorRole: false, active: true }, "u-1"),
    ).toBe(true);
  });

  it("refuses an administrator", () => {
    expect(
      isUserDeactivatable({ id: "u-2", holdsAdministratorRole: true, active: true }, "u-1"),
    ).toBe(false);
  });

  it("refuses the person deactivating, even without the Administrator role", () => {
    expect(
      isUserDeactivatable({ id: "u-1", holdsAdministratorRole: false, active: true }, "u-1"),
    ).toBe(false);
  });

  it("refuses a user who is already inactive", () => {
    expect(
      isUserDeactivatable({ id: "u-2", holdsAdministratorRole: false, active: false }, "u-1"),
    ).toBe(false);
  });
});

describe("isUserReactivatable", () => {
  it("lets an inactive user be reactivated", () => {
    expect(isUserReactivatable({ active: false })).toBe(true);
  });

  it("refuses an active user", () => {
    expect(isUserReactivatable({ active: true })).toBe(false);
  });
});
