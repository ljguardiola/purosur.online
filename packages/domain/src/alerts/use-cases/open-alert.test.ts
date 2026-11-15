import { describe, expect, it } from "vitest";
import type { OpenAlertInput } from "../model/alert-details.js";
import {
  ALERT_ESCALATION_DELAY_MS,
  LATE_PAYMENT_REFUND_ESCALATION_DELAY_MS,
  REFUND_TASK_ESCALATION_DELAY_MS,
} from "../model/alert-kind-policy.js";
import { openAlert } from "./open-alert.js";
import { ELSEWHERE, HERE, NOW, seedEmailViewers } from "./test-support/alert-fixtures.js";
import { FakeAlertStore, FixedClock } from "./test-support/fake-alert-store.js";

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
  it("schedules an expiring-certificate alert to escalate 7 days before the certificate expires", async () => {
    const store = storeWithViewers();
    const notAfter = new Date("2026-10-20T00:00:00.000Z");

    await open(store, {
      kind: "arca_certificate_expiring",
      scope: "production",
      detail: { notAfter: notAfter.toISOString() },
    });

    expect(store.snapshot().alerts[0]?.escalateAt).toEqual(new Date("2026-10-13T00:00:00.000Z"));
  });

  it("opens a late-payment refund alert as a warning for its branch, to escalate 72 hours later", async () => {
    const store = storeWithViewers();

    await open(store, {
      kind: "late_payment_refund",
      scope: "refund-1",
      locationId: HERE,
      detail: { saleId: "sale-1", amount: 2500, providerOrderId: null, method: "QR" },
    });

    expect(store.snapshot().alerts[0]).toMatchObject({
      kind: "late_payment_refund",
      level: "warning",
      audience: "local",
      locationId: HERE,
      escalateAt: new Date(NOW.getTime() + LATE_PAYMENT_REFUND_ESCALATION_DELAY_MS),
    });
    const recipients = store.snapshot().deliveries.map(({ recipientUserId }) => recipientUserId);
    expect(recipients).toContain("branch-same-location");
    expect(recipients).not.toContain("branch-other-location");
  });

  it("opens a forgotten-refund alert as a warning, escalating 72 hours after the refund opened", async () => {
    const store = storeWithViewers();
    const refundOpenedAt = new Date(NOW.getTime() - 30 * 60 * 60 * 1000);

    await open(store, {
      kind: "refund_task",
      scope: "refund-1",
      locationId: HERE,
      detail: {
        saleId: "sale-1",
        amount: 12400,
        method: "TRANSFER",
        refundOpenedAt: refundOpenedAt.toISOString(),
      },
    });

    expect(store.snapshot().alerts[0]).toMatchObject({
      kind: "refund_task",
      level: "warning",
      audience: "local",
      locationId: HERE,
      escalateAt: new Date(refundOpenedAt.getTime() + REFUND_TASK_ESCALATION_DELAY_MS),
    });
  });

  it("opens the alert at the level it is asked to, instead of the level of its kind", async () => {
    const store = storeWithViewers();

    await openAlert({ store, clock: new FixedClock(NOW) }, PASSKEY_CHANGED, "critical");

    expect(store.snapshot().alerts[0]).toMatchObject({ level: "critical" });
  });

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
        conditionClearedAt: null,
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
        change: "enrolled",
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

  it("opens one alert per device with quarantined events, however many of its events are quarantined", async () => {
    const store = storeWithViewers();
    const quarantined = (deviceId: string): OpenAlertInput => ({
      kind: "events_quarantined",
      scope: deviceId,
      detail: { deviceId },
    });

    const first = await open(store, quarantined("device-1"));
    const sameDevice = await open(store, quarantined("device-1"));
    const otherDevice = await open(store, quarantined("device-2"));

    expect(first).toEqual({ kind: "opened", alertId: "alert-1" });
    expect(sameDevice).toEqual({ kind: "already_open", alertId: "alert-1" });
    expect(otherDevice).toEqual({ kind: "opened", alertId: "alert-2" });
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
      conditionClearedAt: null,
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

  describe("by email", () => {
    function storeWithEmailViewers(): FakeAlertStore {
      const store = new FakeAlertStore();
      seedEmailViewers(store);
      return store;
    }

    it("records an email for each opted-in recipient of an alert that goes by email, with its level and the moment it opened", async () => {
      const store = storeWithEmailViewers();

      await open(store, PASSKEY_CHANGED);

      expect(store.snapshot().emailDeliveries).toEqual(
        ["administrator", "view-all"].map((recipientUserId) => ({
          alertId: "alert-1",
          recipientUserId,
          stage: "opened",
          level: "warning",
          occurredAt: NOW,
        })),
      );
    });

    it("records the email of an alert opened at a level other than its kind's with that level", async () => {
      const store = storeWithEmailViewers();

      await openAlert({ store, clock: new FixedClock(NOW) }, PASSKEY_CHANGED, "critical");

      expect(store.snapshot().emailDeliveries[0]).toMatchObject({ level: "critical" });
    });

    it("sends a holder of only view_branch_alerts the alert of their branch that leaves a register unable to sell", async () => {
      const store = storeWithEmailViewers();

      await open(store, {
        kind: "sales_denied",
        scope: "register-1",
        locationId: HERE,
        detail: { deviceId: "device-1", reason: "battery_critical" },
      });

      expect(
        store.snapshot().emailDeliveries.map(({ recipientUserId }) => recipientUserId),
      ).toEqual(["administrator", "view-all", "branch-here"]);
    });

    it("records no email for an alert that stays on the board, though its recipients see it", async () => {
      const store = storeWithEmailViewers();

      await open(store, {
        kind: "late_payment_refund",
        scope: "refund-1",
        locationId: HERE,
        detail: { saleId: "sale-1", amount: 2500, providerOrderId: null, method: "QR" },
      });

      expect(store.snapshot().deliveries.length).toBeGreaterThan(0);
      expect(store.snapshot().emailDeliveries).toEqual([]);
    });

    it("records no email for the expiring ARCA certificate when it opens", async () => {
      const store = storeWithEmailViewers();

      await open(store, {
        kind: "arca_certificate_expiring",
        scope: "production",
        detail: { notAfter: "2026-10-20T00:00:00.000Z" },
      });

      expect(store.snapshot().emailDeliveries).toEqual([]);
    });

    it("records no email for an alert that was already open", async () => {
      const store = storeWithEmailViewers();
      await open(store, PASSKEY_CHANGED);
      const before = store.snapshot().emailDeliveries;

      const outcome = await open(store, PASSKEY_CHANGED);

      expect(outcome.kind).toBe("already_open");
      expect(store.snapshot().emailDeliveries).toEqual(before);
    });

    it("records the emails after the backoffice deliveries, reading the viewers once", async () => {
      const store = storeWithEmailViewers();

      await open(store, PASSKEY_CHANGED);

      expect(store.operationOrder).toEqual([
        "insertAlert",
        "listActiveAlertViewers",
        "recordBackofficeDeliveries",
        "recordEmailDeliveries",
      ]);
    });

    it("opens no alert when recording its emails fails", async () => {
      const store = storeWithEmailViewers();
      store.failingWrites.add("recordEmailDeliveries");

      await expect(open(store, PASSKEY_CHANGED)).rejects.toThrow("recordEmailDeliveries failed");

      expect(store.snapshot().alerts).toEqual([]);
      expect(store.snapshot().deliveries).toEqual([]);
      expect(store.snapshot().emailDeliveries).toEqual([]);
    });
  });
});
