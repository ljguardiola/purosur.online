import { describe, expect, it } from "vitest";
import { escalateOverdueAlerts } from "./escalate-overdue-alerts.js";
import { NOW, seededAlert } from "./test-support/alert-fixtures.js";
import { FakeAlertStore, FixedClock } from "./test-support/fake-alert-store.js";

const OVERDUE = new Date(NOW.getTime() - 1);
const UPCOMING = new Date(NOW.getTime() + 1);

function escalate(store: FakeAlertStore) {
  return escalateOverdueAlerts({ store, clock: new FixedClock(NOW) });
}

describe("escalateOverdueAlerts", () => {
  it("escalates the open warnings whose escalation moment has come, counting them", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "overdue-1", escalateAt: OVERDUE }));
    store.seedAlert(seededAlert({ id: "due-now", escalateAt: NOW }));

    await expect(escalate(store)).resolves.toBe(2);

    for (const alert of store.snapshot().alerts) {
      expect(alert).toMatchObject({ level: "critical", escalatedAt: NOW });
    }
  });

  it("leaves alone every alert that is not an open warning whose escalation moment has come", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "upcoming", escalateAt: UPCOMING }));
    store.seedAlert(seededAlert({ id: "never", escalateAt: null }));
    store.seedAlert(seededAlert({ id: "closed", escalateAt: OVERDUE, resolvedAt: OVERDUE }));
    store.seedAlert(seededAlert({ id: "critical", level: "critical", escalateAt: OVERDUE }));
    const before = store.snapshot().alerts;

    await expect(escalate(store)).resolves.toBe(0);

    expect(store.snapshot().alerts).toEqual(before);
  });

  it("records nothing when no alert is overdue", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "upcoming", escalateAt: UPCOMING }));

    await escalate(store);

    expect(store.operationOrder).toEqual(["lockOpenAlerts"]);
  });

  it("escalates only the overdue ones among several", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "overdue", escalateAt: OVERDUE }));
    store.seedAlert(seededAlert({ id: "upcoming", escalateAt: UPCOMING }));

    await expect(escalate(store)).resolves.toBe(1);

    expect(store.levelOf("overdue")).toBe("critical");
    expect(store.levelOf("upcoming")).toBe("warning");
  });

  it("locks the open alerts before escalating them", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "overdue", escalateAt: OVERDUE }));

    await escalate(store);

    expect(store.operationOrder).toEqual(["lockOpenAlerts", "recordEscalation"]);
  });

  it("escalates nothing when recording the escalation fails", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "overdue", escalateAt: OVERDUE }));
    store.failingWrites.add("recordEscalation");

    await expect(escalate(store)).rejects.toThrow("recordEscalation failed");

    expect(store.levelOf("overdue")).toBe("warning");
  });
});
