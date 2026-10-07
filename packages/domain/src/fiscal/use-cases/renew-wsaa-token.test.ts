import { describe, expect, it } from "vitest";
import { renewWsaaToken } from "./renew-wsaa-token.js";
import { FixedClock } from "./test-support/fake-arca-certificate-expiry-store.js";
import {
  FakeWsaaAuthentication,
  FakeWsaaTokenStore,
} from "./test-support/fake-wsaa-token-store.js";
import type { WsaaAuthenticationResult } from "./wsaa-token-ports.js";

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-10-01T12:00:00.000Z");
const SERVICE = "wsfe";
const FINGERPRINT = "ab:cd";

const persisted = (remainingMs: number) => ({
  token: "old-token",
  sign: "old-sign",
  issuedAt: new Date(NOW.getTime() - 11 * HOUR_MS),
  expiresAt: new Date(NOW.getTime() + remainingMs),
});

const ISSUED = {
  token: "new-token",
  sign: "new-sign",
  issuedAt: NOW,
  expiresAt: new Date(NOW.getTime() + 12 * HOUR_MS),
};

function renew(store: FakeWsaaTokenStore, result: WsaaAuthenticationResult) {
  const authentication = new FakeWsaaAuthentication(store, result);
  const outcome = renewWsaaToken(
    { store, authentication, clock: new FixedClock(NOW) },
    { service: SERVICE, certificateFingerprint: FINGERPRINT },
  );
  return { authentication, outcome };
}

describe("renewWsaaToken", () => {
  it("keeps a token that is still valid, however little time it has left, and never calls WSAA", async () => {
    const store = new FakeWsaaTokenStore();
    store.seed(SERVICE, FINGERPRINT, persisted(1));
    const { authentication, outcome } = renew(store, { kind: "issued", token: ISSUED });

    await expect(outcome).resolves.toEqual({ kind: "kept" });

    expect(authentication.requestedServices).toEqual([]);
    expect(store.operations).toEqual(["lockWsaaToken"]);
    expect(store.rows[0]?.token.token).toBe("old-token");
  });

  it("requests and records a token when none is persisted", async () => {
    const store = new FakeWsaaTokenStore();
    const { authentication, outcome } = renew(store, { kind: "issued", token: ISSUED });

    await expect(outcome).resolves.toEqual({ kind: "renewed" });

    expect(authentication.requestedServices).toEqual([SERVICE]);
    expect(store.rows).toEqual([
      { service: SERVICE, certificateFingerprint: FINGERPRINT, token: ISSUED },
    ]);
  });

  it("replaces a token once it expired", async () => {
    const store = new FakeWsaaTokenStore();
    store.seed(SERVICE, FINGERPRINT, persisted(0));
    const { outcome } = renew(store, { kind: "issued", token: ISSUED });

    await expect(outcome).resolves.toEqual({ kind: "renewed" });

    expect(store.rows).toEqual([
      { service: SERVICE, certificateFingerprint: FINGERPRINT, token: ISSUED },
    ]);
  });

  it("locks the token before requesting a new one", async () => {
    const store = new FakeWsaaTokenStore();
    const { outcome } = renew(store, { kind: "issued", token: ISSUED });
    await outcome;

    expect(store.operations).toEqual(["lockWsaaToken", "requestToken", "recordWsaaToken"]);
  });

  it("keeps what is persisted when WSAA says the certificate is already authenticated", async () => {
    const store = new FakeWsaaTokenStore();
    store.seed(SERVICE, FINGERPRINT, persisted(0));
    const { outcome } = renew(store, { kind: "already_authenticated" });

    await expect(outcome).resolves.toEqual({ kind: "already_authenticated" });

    expect(store.operations).toEqual(["lockWsaaToken", "requestToken"]);
    expect(store.rows[0]?.token.token).toBe("old-token");
  });

  it("records nothing when WSAA fails", async () => {
    const store = new FakeWsaaTokenStore();
    const { outcome } = renew(store, { kind: "failed" });

    await expect(outcome).resolves.toEqual({ kind: "failed" });

    expect(store.operations).toEqual(["lockWsaaToken", "requestToken"]);
    expect(store.rows).toEqual([]);
  });

  it("keeps the previous token when recording the new one fails", async () => {
    const store = new FakeWsaaTokenStore();
    store.seed(SERVICE, FINGERPRINT, persisted(0));
    store.failingRecord = true;
    const { outcome } = renew(store, { kind: "issued", token: ISSUED });

    await expect(outcome).rejects.toThrow("recordWsaaToken failed");

    expect(store.rows[0]?.token.token).toBe("old-token");
  });

  it("keeps a token per certificate", async () => {
    const store = new FakeWsaaTokenStore();
    store.seed(SERVICE, "other:fingerprint", persisted(HOUR_MS * 5));
    const { outcome } = renew(store, { kind: "issued", token: ISSUED });

    await expect(outcome).resolves.toEqual({ kind: "renewed" });

    expect(store.rows).toHaveLength(2);
  });
});
