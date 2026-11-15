import type { FakeAlert, FakeAlertStore } from "./fake-alert-store.js";

export const NOW = new Date("2026-10-01T12:00:00.000Z");

export function seededAlert(overrides: Partial<FakeAlert> = {}): Omit<FakeAlert, "id"> {
  return {
    kind: "backoffice_passkey_changed",
    scope: "user-1",
    level: "warning",
    audience: "all",
    locationId: null,
    detail: {},
    openedAt: new Date("2026-09-30T09:00:00.000Z"),
    escalateAt: new Date("2026-10-01T09:00:00.000Z"),
    escalatedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    conditionClearedAt: null,
    deduplicates: true,
    ...overrides,
  };
}

export const HERE = "location-here";
export const ELSEWHERE = "location-elsewhere";

export function seedEmailViewers(store: FakeAlertStore): void {
  const viewer = (
    userId: string,
    locationId: string,
    permissionKeys: string[],
    overrides: { isAdministrator?: boolean; optedIn?: boolean; active?: boolean } = {},
  ) =>
    store.seedViewer({
      userId,
      locationId,
      permissionKeys,
      isAdministrator: overrides.isAdministrator ?? false,
      alertEmailOptedIn: overrides.optedIn ?? true,
      active: overrides.active ?? true,
    });
  viewer("administrator", ELSEWHERE, [], { isAdministrator: true });
  viewer("view-all", ELSEWHERE, ["view_all_alerts"]);
  viewer("view-all-opted-out", ELSEWHERE, ["view_all_alerts"], { optedIn: false });
  viewer("branch-here", HERE, ["view_branch_alerts"]);
  viewer("branch-here-opted-out", HERE, ["view_branch_alerts"], { optedIn: false });
  viewer("branch-elsewhere", ELSEWHERE, ["view_branch_alerts"]);
  viewer("cashier", HERE, ["sell_and_charge"]);
  viewer("inactive-administrator", HERE, [], { isAdministrator: true, active: false });
}
