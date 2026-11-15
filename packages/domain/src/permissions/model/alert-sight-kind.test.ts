import { describe, expect, it } from "vitest";
import { alertSightKindOf } from "./alert-sight-kind.js";

function access(overrides: { isAdministrator?: boolean; permissionKeys?: string[] } = {}) {
  return {
    isAdministrator: overrides.isAdministrator ?? false,
    permissionKeys: overrides.permissionKeys ?? [],
  };
}

describe("alertSightKindOf", () => {
  it("gives an administrator the sight of every alert", () => {
    expect(alertSightKindOf(access({ isAdministrator: true }))).toBe("all");
  });

  it("gives a holder of view_all_alerts the sight of every alert, even also holding view_branch_alerts", () => {
    expect(alertSightKindOf(access({ permissionKeys: ["view_all_alerts"] }))).toBe("all");
    expect(
      alertSightKindOf(access({ permissionKeys: ["view_branch_alerts", "view_all_alerts"] })),
    ).toBe("all");
  });

  it("gives a holder of only view_branch_alerts the sight of the local alerts", () => {
    expect(alertSightKindOf(access({ permissionKeys: ["view_branch_alerts"] }))).toBe("local");
  });

  it("gives no sight to someone holding neither alert permission", () => {
    expect(alertSightKindOf(access({ permissionKeys: ["sell_and_charge"] }))).toBe("none");
    expect(alertSightKindOf(access())).toBe("none");
  });
});
