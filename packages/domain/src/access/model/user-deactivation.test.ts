import { describe, expect, it } from "vitest";
import { isUserDeactivatable } from "./user-deactivation.js";

describe("isUserDeactivatable", () => {
  it("lets someone else without the Administrator role be deactivated", () => {
    expect(isUserDeactivatable({ id: "u-2", holdsAdministratorRole: false }, "u-1")).toBe(true);
  });

  it("refuses an administrator", () => {
    expect(isUserDeactivatable({ id: "u-2", holdsAdministratorRole: true }, "u-1")).toBe(false);
  });

  it("refuses the person deactivating, even without the Administrator role", () => {
    expect(isUserDeactivatable({ id: "u-1", holdsAdministratorRole: false }, "u-1")).toBe(false);
  });
});
