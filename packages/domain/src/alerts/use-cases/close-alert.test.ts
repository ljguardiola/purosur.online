import { describe, expect, it } from "vitest";
import { closeAlert } from "./close-alert.js";
import { HERE, NOW, seedEmailViewers, seededAlert } from "./test-support/alert-fixtures.js";
import { FakeAlertStore, FixedClock, PrefixHasher } from "./test-support/fake-alert-store.js";

function close(store: FakeAlertStore, alertId: string) {
  return closeAlert(
    { store, clock: new FixedClock(NOW), hasher: new PrefixHasher() },
    { alertId, closedBy: "administrator" },
  );
}

describe("closeAlert", () => {
  it("answers not_found for an alert that does not exist", async () => {
    const store = new FakeAlertStore();

    await expect(close(store, "missing")).resolves.toEqual({ kind: "not_found" });
    expect(store.operationOrder).toEqual(["lockAlert"]);
  });

  it("answers already_closed, changing nothing, for an alert that was closed", async () => {
    const store = new FakeAlertStore();
    const resolvedAt = new Date("2026-09-30T10:00:00.000Z");
    store.seedAlert(seededAlert({ id: "alert-9", resolvedAt, resolvedBy: "someone-else" }));

    await expect(close(store, "alert-9")).resolves.toEqual({ kind: "already_closed" });

    expect(store.operationOrder).toEqual(["lockAlert"]);
    expect(store.snapshot().alerts[0]).toMatchObject({ resolvedAt, resolvedBy: "someone-else" });
  });

  it("closes an open alert, recording when and by whom, and answers it as locked, with its scope and detail kept", async () => {
    const store = new FakeAlertStore();
    const escalatedAt = new Date("2026-10-01T09:05:00.000Z");
    store.seedAlert(
      seededAlert({
        id: "alert-9",
        detail: { actorId: "user-1" },
        level: "critical",
        escalatedAt,
      }),
    );

    const outcome = await close(store, "alert-9");

    expect(outcome).toEqual({
      kind: "closed",
      alert: {
        alertId: "alert-9",
        kind: "backoffice_passkey_changed",
        level: "critical",
        escalatedAt,
        scope: "user-1",
        detail: { actorId: "user-1" },
        closedAt: NOW,
        closedBy: "administrator",
      },
    });
    expect(store.snapshot().alerts[0]).toMatchObject({
      resolvedAt: NOW,
      resolvedBy: "administrator",
      scope: "user-1",
      detail: { actorId: "user-1" },
    });
  });

  it("replaces the source address a closed lockout alert keeps by its hash, in the scope and in the detail", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(
      seededAlert({
        id: "alert-9",
        kind: "backoffice_sign_in_lockout",
        scope: "203.0.113.7",
        detail: { sourceAddress: "203.0.113.7", failureCount: 5, blockedUntil: "2026-10-01" },
      }),
    );

    const outcome = await close(store, "alert-9");

    const kept = {
      scope: "hash-of-203.0.113.7",
      detail: { sourceAddress: "hash-of-203.0.113.7", failureCount: 5, blockedUntil: "2026-10-01" },
    };
    expect(outcome).toMatchObject({ kind: "closed", alert: kept });
    expect(store.snapshot().alerts[0]).toMatchObject(kept);
  });

  it("hashes only the scope of a closed lockout alert whose detail holds no source address", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(
      seededAlert({
        id: "alert-9",
        kind: "backoffice_sign_in_lockout",
        scope: "203.0.113.7",
        detail: {},
      }),
    );

    await close(store, "alert-9");

    expect(store.snapshot().alerts[0]).toMatchObject({ scope: "hash-of-203.0.113.7", detail: {} });
    expect(store.snapshot().alerts[0]?.detail).not.toHaveProperty("sourceAddress");
  });

  it("locks the alert before recording its closure", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "alert-9" }));

    await close(store, "alert-9");

    expect(store.operationOrder).toEqual(["lockAlert", "recordClosure", "listActiveAlertViewers"]);
  });

  it("leaves the alert open when recording the closure fails", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "alert-9" }));
    store.failingWrites.add("recordClosure");

    await expect(close(store, "alert-9")).rejects.toThrow("recordClosure failed");

    expect(store.snapshot().alerts[0]).toMatchObject({ resolvedAt: null, resolvedBy: null });
  });

  describe("by email", () => {
    function storeWithEmailViewers(): FakeAlertStore {
      const store = new FakeAlertStore();
      seedEmailViewers(store);
      return store;
    }

    it("records an email for each opted-in recipient of an alert that goes by email, at the level it had when it closed", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "alert-9", level: "critical" }));

      await close(store, "alert-9");

      expect(store.snapshot().emailDeliveries).toEqual(
        ["administrator", "view-all"].map((recipientUserId) => ({
          alertId: "alert-9",
          recipientUserId,
          stage: "resolved",
          level: "critical",
          occurredAt: NOW,
        })),
      );
    });

    it("sends a holder of only view_branch_alerts the end of an alert of their branch that left a register unable to sell", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(
        seededAlert({ id: "alert-9", kind: "sales_denied", audience: "local", locationId: HERE }),
      );

      await close(store, "alert-9");

      expect(
        store.snapshot().emailDeliveries.map(({ recipientUserId }) => recipientUserId),
      ).toEqual(["administrator", "view-all", "branch-here"]);
    });

    it("decides the recipients when it closes, not when it opened", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "alert-9" }));
      store.seedViewer({
        userId: "joined-later",
        locationId: HERE,
        permissionKeys: ["view_all_alerts"],
        isAdministrator: false,
        alertEmailOptedIn: true,
        active: true,
      });

      await close(store, "alert-9");

      expect(
        store.snapshot().emailDeliveries.map(({ recipientUserId }) => recipientUserId),
      ).toContain("joined-later");
    });

    it("records no email for an alert that stays on the board or that goes by email only when it escalates", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "alert-8", kind: "lots_expiring" }));
      store.seedAlert(seededAlert({ id: "alert-9", kind: "arca_certificate_expiring" }));

      await close(store, "alert-8");
      await close(store, "alert-9");

      expect(store.snapshot().emailDeliveries).toEqual([]);
    });

    it("records no email when the alert was already closed", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "alert-9", resolvedAt: NOW, resolvedBy: "someone-else" }));

      await close(store, "alert-9");

      expect(store.snapshot().emailDeliveries).toEqual([]);
    });

    it("records the emails after the closure", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "alert-9" }));

      await close(store, "alert-9");

      expect(store.operationOrder).toEqual([
        "lockAlert",
        "recordClosure",
        "listActiveAlertViewers",
        "recordEmailDeliveries",
      ]);
    });

    it("leaves the alert open when recording the emails fails", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "alert-9" }));
      store.failingWrites.add("recordEmailDeliveries");

      await expect(close(store, "alert-9")).rejects.toThrow("recordEmailDeliveries failed");

      expect(store.snapshot().alerts[0]).toMatchObject({ resolvedAt: null, resolvedBy: null });
    });
  });
});
