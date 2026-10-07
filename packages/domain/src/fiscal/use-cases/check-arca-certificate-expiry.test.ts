import { describe, expect, it } from "vitest";
import { checkArcaCertificateExpiry } from "./check-arca-certificate-expiry.js";
import {
  FakeArcaCertificateExpiryStore,
  FixedClock,
} from "./test-support/fake-arca-certificate-expiry-store.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-01T12:00:00.000Z");
const EXPIRING = new Date(NOW.getTime() + 20 * DAY_MS);
const DISTANT = new Date(NOW.getTime() + 300 * DAY_MS);
const LATER_EXPIRING = new Date(NOW.getTime() + 25 * DAY_MS);

function check(store: FakeArcaCertificateExpiryStore, notAfter: Date, environment = "production") {
  return checkArcaCertificateExpiry(
    { store, clock: new FixedClock(NOW) },
    { environment, notAfter },
  );
}

describe("checkArcaCertificateExpiry", () => {
  it("answers distant, writing nothing, for a certificate far from expiring with no alert open", async () => {
    const store = new FakeArcaCertificateExpiryStore();

    await expect(check(store, DISTANT)).resolves.toEqual({ kind: "distant" });

    expect(store.operationOrder).toEqual(["lockOpenCertificateExpiringAlert"]);
    expect(store.snapshot().alerts).toEqual([]);
  });

  it("opens an alert for an expiring certificate with no alert open", async () => {
    const store = new FakeArcaCertificateExpiryStore();

    await expect(check(store, EXPIRING)).resolves.toEqual({ kind: "opened" });

    expect(store.snapshot().alerts).toEqual([
      {
        alertId: "alert-1",
        environment: "production",
        notAfter: EXPIRING,
        openedAt: NOW,
        resolvedAt: null,
      },
    ]);
  });

  it("answers unchanged, writing nothing, when the open alert is for the same certificate", async () => {
    const store = new FakeArcaCertificateExpiryStore();
    store.seedOpenAlert("production", EXPIRING);

    await expect(check(store, EXPIRING)).resolves.toEqual({ kind: "unchanged" });

    expect(store.operationOrder).toEqual(["lockOpenCertificateExpiringAlert"]);
  });

  it("resolves the open alert when a certificate far from expiring was loaded", async () => {
    const store = new FakeArcaCertificateExpiryStore();
    const alertId = store.seedOpenAlert("production", EXPIRING);

    await expect(check(store, DISTANT)).resolves.toEqual({ kind: "resolved" });

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ alertId, resolvedAt: NOW }),
    ]);
  });

  it("replaces the open alert when another expiring certificate was loaded", async () => {
    const store = new FakeArcaCertificateExpiryStore();
    const alertId = store.seedOpenAlert("production", EXPIRING);

    await expect(check(store, LATER_EXPIRING)).resolves.toEqual({ kind: "replaced" });

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ alertId, resolvedAt: NOW }),
      expect.objectContaining({
        alertId: "alert-2",
        environment: "production",
        notAfter: LATER_EXPIRING,
        openedAt: NOW,
        resolvedAt: null,
      }),
    ]);
  });

  it("leaves the alert of another environment alone", async () => {
    const store = new FakeArcaCertificateExpiryStore();
    store.seedOpenAlert("homologation", EXPIRING);

    await expect(check(store, DISTANT, "production")).resolves.toEqual({ kind: "distant" });

    expect(store.snapshot().alerts).toEqual([expect.objectContaining({ resolvedAt: null })]);
  });

  it("looks the open alert up before any write", async () => {
    const store = new FakeArcaCertificateExpiryStore();
    store.seedOpenAlert("production", EXPIRING);

    await check(store, LATER_EXPIRING);

    expect(store.operationOrder).toEqual([
      "lockOpenCertificateExpiringAlert",
      "resolveCertificateExpiringAlert",
      "openCertificateExpiringAlert",
    ]);
  });

  it("keeps the old alert open when opening its replacement fails", async () => {
    const store = new FakeArcaCertificateExpiryStore();
    store.seedOpenAlert("production", EXPIRING);
    store.failingWrites.add("openCertificateExpiringAlert");

    await expect(check(store, LATER_EXPIRING)).rejects.toThrow(
      "openCertificateExpiringAlert failed",
    );

    expect(store.snapshot().alerts).toEqual([expect.objectContaining({ resolvedAt: null })]);
  });

  it("opens nothing when resolving the old alert fails", async () => {
    const store = new FakeArcaCertificateExpiryStore();
    store.seedOpenAlert("production", EXPIRING);
    store.failingWrites.add("resolveCertificateExpiringAlert");

    await expect(check(store, LATER_EXPIRING)).rejects.toThrow(
      "resolveCertificateExpiringAlert failed",
    );

    expect(store.snapshot().alerts).toHaveLength(1);
  });
});
