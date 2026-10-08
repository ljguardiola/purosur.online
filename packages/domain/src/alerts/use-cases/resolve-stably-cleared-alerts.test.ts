import { describe, expect, it } from "vitest";
import { ALERT_CONDITION_STABLE_CLEAR_MS } from "../model/alert-condition-resolution.js";
import { observeAlertCondition } from "./observe-alert-condition.js";
import { resolveStablyClearedAlerts } from "./resolve-stably-cleared-alerts.js";
import { NOW, seededAlert } from "./test-support/alert-fixtures.js";
import { FakeAlertStore, FixedClock, PrefixHasher } from "./test-support/fake-alert-store.js";

const STABLE = new Date(NOW.getTime() - ALERT_CONDITION_STABLE_CLEAR_MS);
const NOT_YET_STABLE = new Date(NOW.getTime() - ALERT_CONDITION_STABLE_CLEAR_MS + 1);

function resolveCleared(store: FakeAlertStore, at = NOW) {
  return resolveStablyClearedAlerts({
    store,
    clock: new FixedClock(at),
    hasher: new PrefixHasher(),
  });
}

function seedConditionAlert(store: FakeAlertStore, id: string, overrides = {}) {
  store.seedAlert(
    seededAlert({ id, kind: "update_required", scope: `register-${id}`, ...overrides }),
  );
}

describe("resolveStablyClearedAlerts", () => {
  it("resolves, on their own, the open alerts whose condition has stayed cleared for 10 minutes, counting them", async () => {
    const store = new FakeAlertStore();
    seedConditionAlert(store, "alert-1", { conditionClearedAt: STABLE });
    seedConditionAlert(store, "alert-2", {
      conditionClearedAt: new Date(STABLE.getTime() - 3_600_000),
    });

    await expect(resolveCleared(store)).resolves.toBe(2);

    for (const alert of store.snapshot().alerts) {
      expect(alert).toMatchObject({ resolvedAt: NOW, resolvedBy: null });
    }
  });

  it("keeps the scope and the detail of what it resolves", async () => {
    const store = new FakeAlertStore();
    seedConditionAlert(store, "alert-1", {
      conditionClearedAt: STABLE,
      detail: { deviceId: "device-1", appVersion: "0.9.0" },
    });

    await resolveCleared(store);

    expect(store.snapshot().alerts[0]).toMatchObject({
      scope: "register-alert-1",
      detail: { deviceId: "device-1", appVersion: "0.9.0" },
    });
  });

  it("leaves alone an alert whose condition cleared less than 10 minutes ago", async () => {
    const store = new FakeAlertStore();
    seedConditionAlert(store, "alert-1", { conditionClearedAt: NOT_YET_STABLE });

    await expect(resolveCleared(store)).resolves.toBe(0);

    expect(store.snapshot().alerts[0]).toMatchObject({ resolvedAt: null, resolvedBy: null });
  });

  it("leaves alone an alert whose condition still holds, and one that already resolved", async () => {
    const store = new FakeAlertStore();
    seedConditionAlert(store, "alert-1", { conditionClearedAt: null });
    const resolvedAt = new Date("2026-10-01T11:00:00.000Z");
    seedConditionAlert(store, "alert-2", {
      conditionClearedAt: STABLE,
      resolvedAt,
      resolvedBy: "someone",
    });

    await expect(resolveCleared(store)).resolves.toBe(0);

    expect(store.snapshot().alerts.map((alert) => alert.resolvedAt)).toEqual([null, resolvedAt]);
  });

  it("locks the candidates before recording any resolution", async () => {
    const store = new FakeAlertStore();
    seedConditionAlert(store, "alert-1", { conditionClearedAt: STABLE });

    await resolveCleared(store);

    expect(store.operationOrder).toEqual(["lockClearedConditionAlerts", "recordClosure"]);
  });

  it("resolves nothing, writing nothing, when no alert is waiting", async () => {
    const store = new FakeAlertStore();

    await expect(resolveCleared(store)).resolves.toBe(0);
    expect(store.operationOrder).toEqual(["lockClearedConditionAlerts"]);
  });

  it("resolves none when recording one resolution fails", async () => {
    const store = new FakeAlertStore();
    seedConditionAlert(store, "alert-1", { conditionClearedAt: STABLE });
    seedConditionAlert(store, "alert-2", { conditionClearedAt: STABLE });
    store.failingWrites.add("recordClosure");

    await expect(resolveCleared(store)).rejects.toThrow("recordClosure failed");

    expect(store.snapshot().alerts.map((alert) => alert.resolvedAt)).toEqual([null, null]);
  });
});

describe("a condition alert's life", () => {
  const holds = {
    holds: true,
    alert: {
      kind: "update_required",
      scope: "register-1",
      detail: { deviceId: "device-1", appVersion: "0.9.0" },
    },
  } as const;
  const cleared = { holds: false, kind: "update_required", scope: "register-1" } as const;
  const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000);

  async function observeAt(
    store: FakeAlertStore,
    at: Date,
    observation: typeof holds | typeof cleared,
  ) {
    await observeAlertCondition(
      { store, clock: new FixedClock(at), hasher: new PrefixHasher() },
      observation,
    );
  }

  it("resolves only once the condition stayed cleared for 10 minutes", async () => {
    const store = new FakeAlertStore();
    await observeAt(store, minutes(0), holds);
    await observeAt(store, minutes(1), cleared);

    await expect(resolveCleared(store, minutes(10))).resolves.toBe(0);
    await expect(resolveCleared(store, minutes(11))).resolves.toBe(1);

    expect(store.snapshot().alerts[0]?.resolvedAt).toEqual(minutes(11));
  });

  it("does not rebound: the condition returning inside the window leaves the alert open and restarts the wait", async () => {
    const store = new FakeAlertStore();
    await observeAt(store, minutes(0), holds);
    await observeAt(store, minutes(1), cleared);
    await observeAt(store, minutes(5), holds);
    await observeAt(store, minutes(6), cleared);

    await expect(resolveCleared(store, minutes(12))).resolves.toBe(0);
    await expect(resolveCleared(store, minutes(16))).resolves.toBe(1);

    const snapshot = store.snapshot();
    expect(snapshot.alerts).toHaveLength(1);
    expect(snapshot.deliveries).toEqual([]);
  });

  it("opens a brand-new alert when the condition returns after the first one resolved", async () => {
    const store = new FakeAlertStore();
    await observeAt(store, minutes(0), holds);
    await observeAt(store, minutes(1), cleared);
    await resolveCleared(store, minutes(12));

    await observeAt(store, minutes(30), holds);

    const alerts = store.snapshot().alerts;
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.resolvedAt).toEqual(minutes(12));
    expect(alerts[1]).toMatchObject({
      openedAt: minutes(30),
      resolvedAt: null,
      conditionClearedAt: null,
    });
  });
});
