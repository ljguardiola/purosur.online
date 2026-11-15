import { describe, expect, it } from "vitest";
import { alertEmailRecorder } from "./alert-email-recorder.js";
import type { AlertStoreTransaction } from "./alert-store.js";
import { ELSEWHERE, HERE, NOW, seedEmailViewers } from "./test-support/alert-fixtures.js";
import { FakeAlertStore } from "./test-support/fake-alert-store.js";

async function record(
  store: FakeAlertStore,
  work: (record: ReturnType<typeof alertEmailRecorder>) => Promise<void>,
) {
  await store.transaction((tx: AlertStoreTransaction) => work(alertEmailRecorder(tx)));
}

const everyone = (kind: "backoffice_passkey_changed" | "fiscal_rejected") => ({
  alertId: "alert-1",
  kind,
  locationId: null,
});

describe("alertEmailRecorder", () => {
  it("records an email for each opted-in holder of view_all_alerts and each administrator, for an alert of every branch", async () => {
    const store = new FakeAlertStore();
    seedEmailViewers(store);

    await record(store, (rec) =>
      rec(everyone("backoffice_passkey_changed"), "opened", "warning", NOW),
    );

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

  it("also records an email for the opted-in holders of only view_branch_alerts of the branch of an alert that leaves a register unable to sell", async () => {
    const store = new FakeAlertStore();
    seedEmailViewers(store);

    await record(store, (rec) =>
      rec(
        { alertId: "alert-1", kind: "sales_denied", locationId: HERE },
        "resolved",
        "critical",
        NOW,
      ),
    );

    expect(store.snapshot().emailDeliveries.map(({ recipientUserId }) => recipientUserId)).toEqual([
      "administrator",
      "view-all",
      "branch-here",
    ]);
  });

  it("records nothing for the holders of only view_branch_alerts when the alert is of a kind that does not leave a register unable to sell or to issue", async () => {
    const store = new FakeAlertStore();
    seedEmailViewers(store);

    await record(store, (rec) =>
      rec({ alertId: "alert-1", kind: "clock_drift", locationId: HERE }, "opened", "critical", NOW),
    );

    expect(store.snapshot().emailDeliveries.map(({ recipientUserId }) => recipientUserId)).toEqual([
      "administrator",
      "view-all",
    ]);
  });

  it("records the stage, level and moment it is given", async () => {
    const store = new FakeAlertStore();
    seedEmailViewers(store);
    const moment = new Date(NOW.getTime() + 60_000);

    await record(store, (rec) =>
      rec(
        { alertId: "alert-7", kind: "sales_denied", locationId: ELSEWHERE },
        "escalated",
        "critical",
        moment,
      ),
    );

    expect(store.snapshot().emailDeliveries[0]).toEqual({
      alertId: "alert-7",
      recipientUserId: "administrator",
      stage: "escalated",
      level: "critical",
      occurredAt: moment,
    });
  });

  it("reads and records nothing at a stage the alert's kind is not sent by email at", async () => {
    const store = new FakeAlertStore();
    seedEmailViewers(store);

    await record(store, async (rec) => {
      await rec(
        { alertId: "alert-1", kind: "arca_certificate_expiring", locationId: null },
        "opened",
        "warning",
        NOW,
      );
      await rec(
        { alertId: "alert-1", kind: "lots_expiring", locationId: HERE },
        "resolved",
        "informational",
        NOW,
      );
    });

    expect(store.operationOrder).toEqual([]);
  });

  it("sends the expiring ARCA certificate only when it escalates", async () => {
    const store = new FakeAlertStore();
    seedEmailViewers(store);

    await record(store, (rec) =>
      rec(
        { alertId: "alert-1", kind: "arca_certificate_expiring", locationId: null },
        "escalated",
        "critical",
        NOW,
      ),
    );

    expect(store.snapshot().emailDeliveries).toHaveLength(2);
  });

  it("records nothing when nobody has opted in", async () => {
    const store = new FakeAlertStore();
    store.seedViewer({
      userId: "administrator",
      locationId: HERE,
      permissionKeys: [],
      isAdministrator: true,
      active: true,
    });

    await record(store, (rec) => rec(everyone("fiscal_rejected"), "opened", "critical", NOW));

    expect(store.operationOrder).toEqual(["listActiveAlertViewers"]);
  });

  it("reads the viewers once however many alerts it records for", async () => {
    const store = new FakeAlertStore();
    seedEmailViewers(store);

    await record(store, async (rec) => {
      await rec(everyone("fiscal_rejected"), "escalated", "critical", NOW);
      await rec(everyone("backoffice_passkey_changed"), "escalated", "critical", NOW);
    });

    expect(store.operationOrder).toEqual([
      "listActiveAlertViewers",
      "recordEmailDeliveries",
      "recordEmailDeliveries",
    ]);
  });

  it("uses the viewers it is given instead of reading them again", async () => {
    const store = new FakeAlertStore();
    seedEmailViewers(store);

    await store.transaction(async (tx) => {
      const viewers = await tx.listActiveAlertViewers();
      await alertEmailRecorder(tx, viewers)(everyone("fiscal_rejected"), "opened", "critical", NOW);
    });

    expect(store.operationOrder).toEqual(["listActiveAlertViewers", "recordEmailDeliveries"]);
  });
});
