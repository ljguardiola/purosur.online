import { describe, expect, it } from "vitest";
import type { OpenSession } from "../session/open-session.js";
import { canSeeAlert, canSeeAnyAlerts } from "./alert-visibility.js";

const BASE_SESSION: OpenSession = {
  sessionId: "a-session-id",
  userId: "a-user-id",
  firstName: "Ada",
  createdAt: new Date("2026-01-05T12:00:00.000Z"),
  lastSeenAt: new Date("2026-01-05T12:00:00.000Z"),
  locationId: "location-a",
  isAdministrator: false,
  passkeyAuthorizedAt: null,
  permissionKeys: [],
};

const LOCAL_ALERT_OWN_BRANCH = { audience: "local" as const, locationId: "location-a" };
const LOCAL_ALERT_OTHER_BRANCH = { audience: "local" as const, locationId: "location-b" };
const ALL_ALERT = { audience: "all" as const, locationId: null };

describe("an Administrator", () => {
  const administrator: OpenSession = { ...BASE_SESSION, isAdministrator: true };

  it("sees every alert, Local or All, of any branch", () => {
    expect(canSeeAnyAlerts(administrator)).toBe(true);
    expect(canSeeAlert(administrator, ALL_ALERT)).toBe(true);
    expect(canSeeAlert(administrator, LOCAL_ALERT_OWN_BRANCH)).toBe(true);
    expect(canSeeAlert(administrator, LOCAL_ALERT_OTHER_BRANCH)).toBe(true);
  });
});

describe("a holder of view_all_alerts", () => {
  const viewer: OpenSession = { ...BASE_SESSION, permissionKeys: ["view_all_alerts"] };

  it("sees every alert regardless of audience or branch", () => {
    expect(canSeeAnyAlerts(viewer)).toBe(true);
    expect(canSeeAlert(viewer, ALL_ALERT)).toBe(true);
    expect(canSeeAlert(viewer, LOCAL_ALERT_OWN_BRANCH)).toBe(true);
    expect(canSeeAlert(viewer, LOCAL_ALERT_OTHER_BRANCH)).toBe(true);
  });
});

describe("a holder of view_branch_alerts", () => {
  const viewer: OpenSession = { ...BASE_SESSION, permissionKeys: ["view_branch_alerts"] };

  it("sees a Local alert of their own branch", () => {
    expect(canSeeAnyAlerts(viewer)).toBe(true);
    expect(canSeeAlert(viewer, LOCAL_ALERT_OWN_BRANCH)).toBe(true);
  });

  it("never sees a Local alert of another branch", () => {
    expect(canSeeAlert(viewer, LOCAL_ALERT_OTHER_BRANCH)).toBe(false);
  });

  it("never sees an All-audience alert", () => {
    expect(canSeeAlert(viewer, ALL_ALERT)).toBe(false);
  });
});

describe("a user with neither alert-view permission", () => {
  it("sees no alert at all", () => {
    expect(canSeeAnyAlerts(BASE_SESSION)).toBe(false);
    expect(canSeeAlert(BASE_SESSION, ALL_ALERT)).toBe(false);
    expect(canSeeAlert(BASE_SESSION, LOCAL_ALERT_OWN_BRANCH)).toBe(false);
  });
});
