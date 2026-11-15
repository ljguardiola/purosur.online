import { describe, expect, it } from "vitest";
import { escalateOverdueAlerts } from "./escalate-overdue-alerts.js";
import { HERE, NOW, seedEmailViewers, seededAlert } from "./test-support/alert-fixtures.js";
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

    expect(store.operationOrder).toEqual([
      "lockOpenAlerts",
      "recordEscalation",
      "listActiveAlertViewers",
    ]);
  });

  it("escalates nothing when recording the escalation fails", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "overdue", escalateAt: OVERDUE }));
    store.failingWrites.add("recordEscalation");

    await expect(escalate(store)).rejects.toThrow("recordEscalation failed");

    expect(store.levelOf("overdue")).toBe("warning");
  });

  describe("by email", () => {
    function storeWithEmailViewers(): FakeAlertStore {
      const store = new FakeAlertStore();
      seedEmailViewers(store);
      return store;
    }

    it("records an email for each opted-in recipient of an escalated alert that goes by email, at the level it escalated to", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "overdue", escalateAt: OVERDUE }));

      await escalate(store);

      expect(store.snapshot().emailDeliveries).toEqual(
        ["administrator", "view-all"].map((recipientUserId) => ({
          alertId: "overdue",
          recipientUserId,
          stage: "escalated",
          level: "critical",
          occurredAt: NOW,
        })),
      );
    });

    it("sends a holder of only view_branch_alerts the escalation of an alert of their branch that leaves a register unable to sell", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(
        seededAlert({
          id: "overdue",
          kind: "sales_denied",
          audience: "local",
          locationId: HERE,
          escalateAt: OVERDUE,
        }),
      );

      await escalate(store);

      expect(
        store.snapshot().emailDeliveries.map(({ recipientUserId }) => recipientUserId),
      ).toEqual(["administrator", "view-all", "branch-here"]);
    });

    it("sends the expiring ARCA certificate when it escalates", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(
        seededAlert({ id: "overdue", kind: "arca_certificate_expiring", escalateAt: OVERDUE }),
      );

      await escalate(store);

      expect(store.snapshot().emailDeliveries).toHaveLength(2);
    });

    it("records no email for an alert that stays on the board", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "overdue", kind: "lots_expiring", escalateAt: OVERDUE }));

      await escalate(store);

      expect(store.snapshot().emailDeliveries).toEqual([]);
      expect(store.operationOrder).toEqual(["lockOpenAlerts", "recordEscalation"]);
    });

    it("records the emails of every escalated alert after recording the escalation, reading the viewers once", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "overdue-1", escalateAt: OVERDUE }));
      store.seedAlert(seededAlert({ id: "overdue-2", escalateAt: OVERDUE }));

      await escalate(store);

      expect(store.operationOrder).toEqual([
        "lockOpenAlerts",
        "recordEscalation",
        "listActiveAlertViewers",
        "recordEmailDeliveries",
        "recordEmailDeliveries",
      ]);
    });

    it("escalates nothing when recording the emails fails", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "overdue", escalateAt: OVERDUE }));
      store.failingWrites.add("recordEmailDeliveries");

      await expect(escalate(store)).rejects.toThrow("recordEmailDeliveries failed");

      expect(store.levelOf("overdue")).toBe("warning");
    });
  });
});
