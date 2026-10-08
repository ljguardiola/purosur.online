import { describe, expect, it } from "vitest";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";
import { ALERT_CONDITION_STABLE_CLEAR_MS } from "../model/alert-condition-resolution.js";
import type { OpenAlertInput } from "../model/alert-details.js";
import { observeAlertCondition } from "./observe-alert-condition.js";
import { NOW, seededAlert } from "./test-support/alert-fixtures.js";
import { FakeAlertStore, FixedClock, PrefixHasher } from "./test-support/fake-alert-store.js";

const UPDATE_REQUIRED: Extract<OpenAlertInput, { kind: "update_required" }> = {
  kind: "update_required",
  scope: "register-1",
  detail: { deviceId: "device-1", appVersion: "0.9.0" },
};
const HOLDS: AlertConditionObservation = { holds: true, alert: UPDATE_REQUIRED };
const CLEARED: AlertConditionObservation = {
  holds: false,
  kind: "update_required",
  scope: "register-1",
};
const EARLIER = new Date("2026-10-01T11:55:00.000Z");
const STABLY_CLEARED_AT = new Date(NOW.getTime() - ALERT_CONDITION_STABLE_CLEAR_MS);

function storeWithViewer(): FakeAlertStore {
  const store = new FakeAlertStore();
  store.seedViewer({
    userId: "administrator",
    locationId: "location-here",
    permissionKeys: [],
    isAdministrator: true,
    active: true,
  });
  return store;
}

function observe(store: FakeAlertStore, observation: AlertConditionObservation, at = NOW) {
  return observeAlertCondition(
    { store, clock: new FixedClock(at), hasher: new PrefixHasher() },
    observation,
  );
}

function seedOpenUpdateRequired(store: FakeAlertStore, conditionClearedAt: Date | null = null) {
  return store.seedAlert(
    seededAlert({
      id: "alert-9",
      kind: "update_required",
      scope: "register-1",
      level: "critical",
      escalateAt: null,
      detail: { deviceId: "device-1", appVersion: "0.9.0" },
      conditionClearedAt,
    }),
  );
}

describe("observeAlertCondition when the condition holds", () => {
  it("opens the alert, delivering it to the users who may see it, when none is open", async () => {
    const store = storeWithViewer();

    const outcome = await observe(store, HOLDS);

    expect(outcome).toEqual({ kind: "opened", alertId: "alert-1" });
    const snapshot = store.snapshot();
    expect(snapshot.alerts[0]).toMatchObject({
      kind: "update_required",
      scope: "register-1",
      level: "critical",
      audience: "all",
      openedAt: NOW,
      conditionClearedAt: null,
      detail: { deviceId: "device-1", appVersion: "0.9.0" },
    });
    expect(snapshot.deliveries).toEqual([{ alertId: "alert-1", recipientUserId: "administrator" }]);
  });

  it("leaves the open alert exactly as it was, producing nothing again", async () => {
    const store = storeWithViewer();
    seedOpenUpdateRequired(store);
    const before = store.snapshot();

    const outcome = await observe(store, HOLDS);

    expect(outcome).toEqual({ kind: "kept_open", alertId: "alert-9" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockOpenAlertOfKey"]);
  });

  it("removes the mark of a condition that cleared less than 10 minutes ago, without reopening or delivering anything", async () => {
    const store = storeWithViewer();
    seedOpenUpdateRequired(store, new Date(STABLY_CLEARED_AT.getTime() + 1));

    const outcome = await observe(store, HOLDS);

    expect(outcome).toEqual({ kind: "kept_open", alertId: "alert-9" });
    const snapshot = store.snapshot();
    expect(snapshot.alerts).toHaveLength(1);
    expect(snapshot.alerts[0]).toMatchObject({ resolvedAt: null, conditionClearedAt: null });
    expect(snapshot.deliveries).toEqual([]);
  });

  it("resolves the open alert whose condition stayed cleared for 10 minutes and opens a brand-new one", async () => {
    const store = storeWithViewer();
    seedOpenUpdateRequired(store, STABLY_CLEARED_AT);

    const outcome = await observe(store, HOLDS);

    expect(outcome).toEqual({ kind: "opened", alertId: "alert-1" });
    const snapshot = store.snapshot();
    expect(snapshot.alerts).toEqual([
      expect.objectContaining({
        id: "alert-9",
        resolvedAt: NOW,
        resolvedBy: null,
        scope: "register-1",
        detail: { deviceId: "device-1", appVersion: "0.9.0" },
        conditionClearedAt: STABLY_CLEARED_AT,
      }),
      expect.objectContaining({ id: "alert-1", resolvedAt: null, conditionClearedAt: null }),
    ]);
    expect(snapshot.deliveries).toEqual([{ alertId: "alert-1", recipientUserId: "administrator" }]);
  });

  it("resolves the alert whose condition stayed cleared before opening the new one", async () => {
    const store = storeWithViewer();
    seedOpenUpdateRequired(store, STABLY_CLEARED_AT);

    await observe(store, HOLDS);

    expect(store.operationOrder.slice(0, 3)).toEqual([
      "lockOpenAlertOfKey",
      "recordClosure",
      "insertAlert",
    ]);
  });

  it("leaves the alert whose condition stayed cleared open when opening the new one fails", async () => {
    const store = storeWithViewer();
    seedOpenUpdateRequired(store, STABLY_CLEARED_AT);
    store.failingWrites.add("insertAlert");

    await expect(observe(store, HOLDS)).rejects.toThrow("insertAlert failed");

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ id: "alert-9", resolvedAt: null }),
    ]);
  });

  it("opens a brand-new alert when the one that held this condition already resolved", async () => {
    const store = storeWithViewer();
    store.seedAlert(
      seededAlert({
        id: "alert-9",
        kind: "update_required",
        scope: "register-1",
        resolvedAt: EARLIER,
        conditionClearedAt: new Date("2026-10-01T11:40:00.000Z"),
      }),
    );

    const outcome = await observe(store, HOLDS);

    expect(outcome).toEqual({ kind: "opened", alertId: "alert-1" });
    expect(store.snapshot().alerts.map((alert) => alert.resolvedAt)).toEqual([EARLIER, null]);
  });

  it("keeps the alert another observation opened first, when it loses the race to open it", async () => {
    const store = storeWithViewer();
    seedOpenUpdateRequired(store);
    store.loseDedupRace = true;
    store.hideOpenAlertFromLock = true;

    const outcome = await observe(store, HOLDS);

    expect(outcome).toEqual({ kind: "kept_open", alertId: "alert-9" });
  });

  it("locks the open alert of the key before writing anything", async () => {
    const store = storeWithViewer();

    await observe(store, HOLDS);

    expect(store.operationOrder[0]).toBe("lockOpenAlertOfKey");
  });

  it("does not open an alert for another scope's open alert", async () => {
    const store = storeWithViewer();
    store.seedAlert(seededAlert({ id: "alert-9", kind: "update_required", scope: "register-2" }));

    await expect(observe(store, HOLDS)).resolves.toEqual({ kind: "opened", alertId: "alert-1" });
  });
});

describe("observeAlertCondition when the condition no longer holds", () => {
  it("marks the open alert as cleared now, without resolving it", async () => {
    const store = storeWithViewer();
    seedOpenUpdateRequired(store);

    const outcome = await observe(store, CLEARED);

    expect(outcome).toEqual({ kind: "clearing", alertId: "alert-9" });
    expect(store.snapshot().alerts[0]).toMatchObject({
      resolvedAt: null,
      conditionClearedAt: NOW,
    });
    expect(store.operationOrder).toEqual(["lockOpenAlertOfKey", "recordConditionCleared"]);
  });

  it("keeps the original mark when the condition had already cleared", async () => {
    const store = storeWithViewer();
    seedOpenUpdateRequired(store, EARLIER);

    const outcome = await observe(store, CLEARED);

    expect(outcome).toEqual({ kind: "still_clearing", alertId: "alert-9" });
    expect(store.snapshot().alerts[0]?.conditionClearedAt).toEqual(EARLIER);
    expect(store.operationOrder).toEqual(["lockOpenAlertOfKey"]);
  });

  it("does nothing when no alert is open for the key", async () => {
    const store = storeWithViewer();
    store.seedAlert(
      seededAlert({
        id: "alert-9",
        kind: "update_required",
        scope: "register-1",
        resolvedAt: EARLIER,
      }),
    );
    store.seedAlert(seededAlert({ id: "alert-8", kind: "update_required", scope: "register-2" }));
    const before = store.snapshot();

    const outcome = await observe(store, CLEARED);

    expect(outcome).toEqual({ kind: "nothing_open" });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves the alert unmarked when recording the mark fails", async () => {
    const store = storeWithViewer();
    seedOpenUpdateRequired(store);
    store.failingWrites.add("recordConditionCleared");

    await expect(observe(store, CLEARED)).rejects.toThrow("recordConditionCleared failed");

    expect(store.snapshot().alerts[0]?.conditionClearedAt).toBeNull();
  });
});

describe("observeAlertCondition for a kind that does not track an ongoing condition", () => {
  it("refuses to observe it, changing nothing", async () => {
    const store = storeWithViewer();
    store.seedAlert(
      seededAlert({ id: "alert-9", kind: "arca_certificate_expiring", scope: "production" }),
    );
    const before = store.snapshot();

    const outcome = await observe(store, {
      holds: false,
      kind: "arca_certificate_expiring",
      scope: "production",
    });

    expect(outcome).toEqual({ kind: "not_a_condition_alert" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([]);
  });

  it("refuses to open one on a holding observation", async () => {
    const store = storeWithViewer();

    const outcome = await observe(store, {
      holds: true,
      alert: {
        kind: "arca_certificate_expiring",
        scope: "production",
        detail: { notAfter: "2026-11-01T00:00:00.000Z" },
      },
    });

    expect(outcome).toEqual({ kind: "not_a_condition_alert" });
    expect(store.snapshot().alerts).toEqual([]);
  });
});
