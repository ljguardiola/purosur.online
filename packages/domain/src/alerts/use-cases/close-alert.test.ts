import { describe, expect, it } from "vitest";
import { closeAlert } from "./close-alert.js";
import { NOW, seededAlert } from "./test-support/alert-fixtures.js";
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

    expect(store.operationOrder).toEqual(["lockAlert", "recordClosure"]);
  });

  it("leaves the alert open when recording the closure fails", async () => {
    const store = new FakeAlertStore();
    store.seedAlert(seededAlert({ id: "alert-9" }));
    store.failingWrites.add("recordClosure");

    await expect(close(store, "alert-9")).rejects.toThrow("recordClosure failed");

    expect(store.snapshot().alerts[0]).toMatchObject({ resolvedAt: null, resolvedBy: null });
  });
});
