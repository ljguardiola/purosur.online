import { describe, expect, it } from "vitest";
import { resolveAlert } from "./resolve-alert.js";
import { HERE, NOW, seedEmailViewers, seededAlert } from "./test-support/alert-fixtures.js";
import { FakeAlertStore, FixedClock, PrefixHasher } from "./test-support/fake-alert-store.js";

function resolve(store: FakeAlertStore, alertId: string) {
  return resolveAlert({ store, clock: new FixedClock(NOW), hasher: new PrefixHasher() }, alertId);
}

describe("resolveAlert", () => {
  it("answers not_found for an alert that does not exist", async () => {
    const store = new FakeAlertStore();

    await expect(resolve(store, "missing")).resolves.toEqual({ kind: "not_found" });
    expect(store.operationOrder).toEqual(["lockAlert"]);
  });

  it("answers already_resolved, changing nothing, for an alert that was resolved", async () => {
    const store = new FakeAlertStore();
    const resolvedAt = new Date("2026-09-30T10:00:00.000Z");
    store.seedAlert(seededAlert({ id: "alert-9", resolvedAt, resolvedBy: "someone-else" }));

    await expect(resolve(store, "alert-9")).resolves.toEqual({ kind: "already_resolved" });

    expect(store.operationOrder).toEqual(["lockAlert"]);
    expect(store.snapshot().alerts[0]).toMatchObject({ resolvedAt, resolvedBy: "someone-else" });
  });

  it("resolves an open alert on its own, recording when and by no person, with its scope and detail kept", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(
      seededAlert({
        id: "alert-9",
        kind: "arca_certificate_expiring",
        scope: "production",
        detail: { notAfter: "2026-11-01T00:00:00.000Z" },
      }),
    );

    await expect(resolve(store, "alert-9")).resolves.toEqual({ kind: "resolved" });

    expect(store.snapshot().alerts[0]).toMatchObject({
      resolvedAt: NOW,
      resolvedBy: null,
      scope: "production",
      detail: { notAfter: "2026-11-01T00:00:00.000Z" },
    });
  });

  it("replaces the source address a resolved lockout alert keeps by its hash", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(
      seededAlert({
        id: "alert-9",
        kind: "backoffice_sign_in_lockout",
        scope: "203.0.113.7",
        detail: { sourceAddress: "203.0.113.7", failureCount: 5 },
      }),
    );

    await resolve(store, "alert-9");

    expect(store.snapshot().alerts[0]).toMatchObject({
      scope: "hash-of-203.0.113.7",
      detail: { sourceAddress: "hash-of-203.0.113.7", failureCount: 5 },
    });
  });

  it("locks the alert before recording its resolution", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "alert-9" }));

    await resolve(store, "alert-9");

    expect(store.operationOrder).toEqual(["lockAlert", "recordClosure", "listActiveAlertViewers"]);
  });

  it("leaves the alert open when recording the resolution fails", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "alert-9" }));
    store.failingWrites.add("recordClosure");

    await expect(resolve(store, "alert-9")).rejects.toThrow("recordClosure failed");

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

      await resolve(store, "alert-9");

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

      await resolve(store, "alert-9");

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

      await resolve(store, "alert-9");

      expect(
        store.snapshot().emailDeliveries.map(({ recipientUserId }) => recipientUserId),
      ).toContain("joined-later");
    });

    it("records no email for an alert that stays on the board or that goes by email only when it escalates", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "alert-8", kind: "lots_expiring" }));
      store.seedAlert(seededAlert({ id: "alert-9", kind: "arca_certificate_expiring" }));

      await resolve(store, "alert-8");
      await resolve(store, "alert-9");

      expect(store.snapshot().emailDeliveries).toEqual([]);
    });

    it("records no email when the alert was already closed", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "alert-9", resolvedAt: NOW, resolvedBy: "someone-else" }));

      await resolve(store, "alert-9");

      expect(store.snapshot().emailDeliveries).toEqual([]);
    });

    it("records the emails after the closure", async () => {
      const store = storeWithEmailViewers();
      store.seedAlert(seededAlert({ id: "alert-9" }));

      await resolve(store, "alert-9");

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

      await expect(resolve(store, "alert-9")).rejects.toThrow("recordEmailDeliveries failed");

      expect(store.snapshot().alerts[0]).toMatchObject({ resolvedAt: null, resolvedBy: null });
    });
  });
});
