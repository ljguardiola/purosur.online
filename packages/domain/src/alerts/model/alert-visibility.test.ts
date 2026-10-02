import { describe, expect, it } from "vitest";
import { alertLocationId, alertSightOf, canSeeAlert } from "./alert-visibility.js";

const HERE = "location-here";
const ELSEWHERE = "location-elsewhere";

function viewer(overrides: { isAdministrator?: boolean; permissionKeys?: string[] } = {}) {
  return {
    isAdministrator: overrides.isAdministrator ?? false,
    permissionKeys: overrides.permissionKeys ?? [],
    locationId: HERE,
  };
}

describe("alertSightOf", () => {
  it("lets an administrator see every alert", () => {
    expect(alertSightOf(viewer({ isAdministrator: true }))).toEqual({ kind: "all" });
  });

  it("lets a holder of view_all_alerts see every alert, even also holding view_branch_alerts", () => {
    expect(alertSightOf(viewer({ permissionKeys: ["view_all_alerts"] }))).toEqual({ kind: "all" });
    expect(
      alertSightOf(viewer({ permissionKeys: ["view_branch_alerts", "view_all_alerts"] })),
    ).toEqual({ kind: "all" });
  });

  it("limits a holder of view_branch_alerts to the local alerts of their own location", () => {
    expect(alertSightOf(viewer({ permissionKeys: ["view_branch_alerts"] }))).toEqual({
      kind: "local",
      locationId: HERE,
    });
  });

  it("shows nothing to someone holding neither alert permission", () => {
    expect(alertSightOf(viewer({ permissionKeys: ["sell_and_charge"] }))).toEqual({
      kind: "none",
    });
    expect(alertSightOf(viewer())).toEqual({ kind: "none" });
  });
});

describe("canSeeAlert", () => {
  const localHere = { audience: "local", locationId: HERE } as const;
  const localElsewhere = { audience: "local", locationId: ELSEWHERE } as const;
  const localWithoutLocation = { audience: "local", locationId: null } as const;
  const everyone = { audience: "all", locationId: null } as const;

  it("shows every alert to an administrator and to a view_all_alerts holder", () => {
    for (const access of [
      viewer({ isAdministrator: true }),
      viewer({ permissionKeys: ["view_all_alerts"] }),
    ]) {
      for (const alert of [localHere, localElsewhere, localWithoutLocation, everyone]) {
        expect(canSeeAlert(access, alert)).toBe(true);
      }
    }
  });

  it("shows a view_branch_alerts holder only the local alerts of their own location", () => {
    const access = viewer({ permissionKeys: ["view_branch_alerts"] });
    expect(canSeeAlert(access, localHere)).toBe(true);
    expect(canSeeAlert(access, localElsewhere)).toBe(false);
    expect(canSeeAlert(access, localWithoutLocation)).toBe(false);
    expect(canSeeAlert(access, everyone)).toBe(false);
    expect(canSeeAlert(access, { audience: "all", locationId: HERE })).toBe(false);
  });

  it("hides every alert from someone without alert permissions", () => {
    const access = viewer({ permissionKeys: ["sell_and_charge"] });
    expect(canSeeAlert(access, localHere)).toBe(false);
    expect(canSeeAlert(access, everyone)).toBe(false);
  });

  it("shows a view_branch_alerts holder the local alerts of the location their sight names", () => {
    const access = { ...viewer({ permissionKeys: ["view_branch_alerts"] }), locationId: ELSEWHERE };

    expect(alertSightOf(access)).toEqual({ kind: "local", locationId: ELSEWHERE });
    expect(canSeeAlert(access, localElsewhere)).toBe(true);
    expect(canSeeAlert(access, localHere)).toBe(false);
  });
});

describe("alertLocationId", () => {
  it("keeps the location only for an alert whose audience is local", () => {
    expect(alertLocationId("local", HERE)).toBe(HERE);
    expect(alertLocationId("all", HERE)).toBeNull();
  });

  it("is none when the alert names no location", () => {
    expect(alertLocationId("local", undefined)).toBeNull();
    expect(alertLocationId("all", undefined)).toBeNull();
  });
});
