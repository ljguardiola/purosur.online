import { describe, expect, it } from "vitest";
import type { OpenAlertInput } from "../model/alert-details.js";
import { ALERT_ESCALATION_DELAY_MS } from "../model/alert-kind-policy.js";
import { openAlert } from "./open-alert.js";
import { NOW } from "./test-support/alert-fixtures.js";
import { FakeAlertStore, FixedClock } from "./test-support/fake-alert-store.js";

const HERE = "location-here";
const ELSEWHERE = "location-elsewhere";

const PASSKEY_CHANGED: OpenAlertInput = {
  kind: "backoffice_passkey_changed",
  scope: "user-1",
  detail: { action: "removed", passkeyName: "Laptop", actorId: "user-1", via: "self" },
};

function storeWithViewers(): FakeAlertStore {
  const store = new FakeAlertStore();
  const viewer = (
    userId: string,
    locationId: string,
    permissionKeys: string[],
    overrides: { isAdministrator?: boolean; active?: boolean } = {},
  ) =>
    store.seedViewer({
      userId,
      locationId,
      permissionKeys,
      isAdministrator: overrides.isAdministrator ?? false,
      active: overrides.active ?? true,
    });
  viewer("administrator", HERE, [], { isAdministrator: true });
  viewer("view-all", ELSEWHERE, ["view_all_alerts"]);
  viewer("branch-same-location", HERE, ["view_branch_alerts"]);
  viewer("branch-other-location", ELSEWHERE, ["view_branch_alerts"]);
  viewer("cashier", HERE, ["sell_and_charge"]);
  viewer("inactive-administrator", HERE, [], { isAdministrator: true, active: false });
  return store;
}

function open(store: FakeAlertStore, input: OpenAlertInput, at: Date = NOW) {
  return openAlert({ store, clock: new FixedClock(at) }, input);
}

describe("openAlert", () => {
  it("opens the alert and delivers it to the active users who may see it", async () => {
    const store = storeWithViewers();

    const outcome = await open(store, PASSKEY_CHANGED);

    expect(outcome).toEqual({ kind: "opened", alertId: "alert-1" });
    expect(store.snapshot().deliveries).toEqual([
      { alertId: "alert-1", recipientUserId: "administrator" },
      { alertId: "alert-1", recipientUserId: "view-all" },
    ]);
  });

  it("stores the alert with the level, audience and deduplication its kind has", async () => {
    const store = storeWithViewers();

    await open(store, PASSKEY_CHANGED);

    expect(store.snapshot().alerts).toEqual([
      {
        id: "alert-1",
        kind: "backoffice_passkey_changed",
        scope: "user-1",
        level: "warning",
        audience: "all",
        locationId: null,
        detail: PASSKEY_CHANGED.detail,
        openedAt: NOW,
        escalateAt: new Date(NOW.getTime() + ALERT_ESCALATION_DELAY_MS),
        escalatedAt: null,
        resolvedAt: null,
        resolvedBy: null,
        deduplicates: true,
      },
    ]);
  });

  it("opens a kind that never escalates already critical and without an escalation moment", async () => {
    const store = storeWithViewers();

    await open(store, {
      kind: "user_access_increased",
      scope: "user-2",
      detail: { cause: "created_as_administrator", actorId: "administrator" },
    });

    expect(store.snapshot().alerts[0]).toMatchObject({
      level: "critical",
      escalateAt: null,
      deduplicates: false,
    });
  });

  it("keeps no location on an alert every audience sees, even when the caller names one", async () => {
    const store = storeWithViewers();

    await open(store, { ...PASSKEY_CHANGED, locationId: HERE });

    expect(store.snapshot().alerts[0]?.locationId).toBeNull();
  });

  it("does not deliver an alert for every audience to a branch alerts holder or to someone without alert permissions", async () => {
    const store = storeWithViewers();

    await open(store, PASSKEY_CHANGED, NOW);

    const recipients = store.snapshot().deliveries.map((delivery) => delivery.recipientUserId);
    expect(recipients).not.toContain("branch-same-location");
    expect(recipients).not.toContain("branch-other-location");
    expect(recipients).not.toContain("cashier");
    expect(recipients).not.toContain("inactive-administrator");
  });

  it("answers already_open, without a second alert or delivery, when a deduplicating alert of that kind and scope is open", async () => {
    const store = storeWithViewers();
    await open(store, PASSKEY_CHANGED);

    const outcome = await open(store, PASSKEY_CHANGED);

    expect(outcome).toEqual({ kind: "already_open", alertId: "alert-1" });
    expect(store.snapshot().alerts).toHaveLength(1);
    expect(store.snapshot().deliveries).toHaveLength(2);
  });

  it("looks for the open alert in the same transaction whose insert lost the race", async () => {
    const store = storeWithViewers();
    await open(store, PASSKEY_CHANGED);
    store.operationsByTransaction = [];

    await open(store, PASSKEY_CHANGED);

    expect(store.operationsByTransaction).toEqual([["insertAlert", "findOpenAlertId"]]);
  });

  it("opens a second alert for the same scope when it is a different kind", async () => {
    const store = storeWithViewers();
    await open(store, PASSKEY_CHANGED);

    const outcome = await open(store, {
      kind: "user_email_changed",
      scope: "user-1",
      detail: { previousEmail: "a@example.com", newEmail: "b@example.com", actorId: "user-1" },
    });

    expect(outcome).toEqual({ kind: "opened", alertId: "alert-2" });
  });

  it("opens a second alert for the same scope when the kind does not deduplicate", async () => {
    const store = storeWithViewers();
    const enrolled: OpenAlertInput = {
      kind: "register_enrolled",
      scope: "register-1",
      detail: {
        deviceId: "device-1",
        hostname: "CAJA-1",
        windowsVersion: "Windows 11",
        replacedInstallation: false,
      },
    };

    await open(store, enrolled);
    const outcome = await open(store, enrolled);

    expect(outcome).toEqual({ kind: "opened", alertId: "alert-2" });
  });

  it("opens one alert per installation for quarantined events while one is still open", async () => {
    const store = storeWithViewers();
    const quarantined = (deviceId: string, eventId: string): OpenAlertInput => ({
      kind: "events_quarantined",
      scope: deviceId,
      detail: {
        deviceId,
        eventId,
        eventType: "sale_completed",
        aggregateType: "Sale",
        aggregateId: "sale-1",
        error: "depends on CashSession session-1 not applied yet",
      },
    });

    const first = await open(store, quarantined("device-1", "event-1"));
    const sameInstallation = await open(store, quarantined("device-1", "event-2"));
    const otherInstallation = await open(store, quarantined("device-2", "event-3"));

    expect(first).toEqual({ kind: "opened", alertId: "alert-1" });
    expect(sameInstallation).toEqual({ kind: "already_open", alertId: "alert-1" });
    expect(otherInstallation).toEqual({ kind: "opened", alertId: "alert-2" });
  });

  it("opens one alert per event for an invariant violation", async () => {
    const store = storeWithViewers();
    const violated = (eventId: string): OpenAlertInput => ({
      kind: "event_invariant_violated",
      scope: eventId,
      detail: {
        eventId,
        eventType: "sale_completed",
        aggregateType: "Sale",
        aggregateId: "sale-1",
        breaks: ["approved_payments_below_total"],
      },
    });

    await open(store, violated("event-1"));
    const same = await open(store, violated("event-1"));
    const other = await open(store, violated("event-2"));

    expect(same).toEqual({ kind: "already_open", alertId: "alert-1" });
    expect(other).toEqual({ kind: "opened", alertId: "alert-2" });
  });

  it("opens a new alert once the earlier one of that kind and scope is closed", async () => {
    const store = storeWithViewers();
    store.seedAlert({
      id: "closed-alert",
      kind: "backoffice_passkey_changed",
      scope: "user-1",
      level: "warning",
      audience: "all",
      locationId: null,
      detail: {},
      openedAt: NOW,
      escalateAt: null,
      escalatedAt: null,
      resolvedAt: NOW,
      resolvedBy: "administrator",
      deduplicates: true,
    });

    const outcome = await open(store, PASSKEY_CHANGED);

    expect(outcome.kind).toBe("opened");
  });

  it("fails when a deduplication conflict is reported but no open alert exists", async () => {
    const store = storeWithViewers();
    store.loseDedupRace = true;

    await expect(open(store, PASSKEY_CHANGED)).rejects.toThrow(
      "openAlert: dedup violation for backoffice_passkey_changed/user-1 but no open alert found",
    );
  });

  it("lets any other store failure through", async () => {
    const store = storeWithViewers();
    store.failingWrites.add("insertAlert");

    await expect(open(store, PASSKEY_CHANGED)).rejects.toThrow("insertAlert failed");
  });

  it("leaves nothing behind when recording the deliveries fails", async () => {
    const store = storeWithViewers();
    store.failingWrites.add("recordBackofficeDeliveries");

    await expect(open(store, PASSKEY_CHANGED)).rejects.toThrow("recordBackofficeDeliveries failed");

    expect(store.snapshot().alerts).toEqual([]);
    expect(store.snapshot().deliveries).toEqual([]);
  });

  it("records no delivery when nobody may see the alert", async () => {
    const store = new FakeAlertStore();

    const outcome = await open(store, PASSKEY_CHANGED);

    expect(outcome.kind).toBe("opened");
    expect(store.operationOrder).toEqual(["insertAlert", "listActiveAlertViewers"]);
  });

  it("inserts the alert before choosing who receives it and records the deliveries last", async () => {
    const store = storeWithViewers();

    await open(store, PASSKEY_CHANGED);

    expect(store.operationOrder).toEqual([
      "insertAlert",
      "listActiveAlertViewers",
      "recordBackofficeDeliveries",
    ]);
  });
});
