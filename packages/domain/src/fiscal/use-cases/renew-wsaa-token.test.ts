import { describe, expect, it } from "vitest";
import {
  WSAA_ALREADY_AUTHENTICATED_RETRY_MINUTES,
  WSAA_ALREADY_AUTHENTICATED_RETRY_MS,
} from "../model/wsaa-token.js";
import { renewWsaaToken } from "./renew-wsaa-token.js";
import {
  FakeWsaaAuthentication,
  FakeWsaaTokenStore,
} from "./test-support/fake-wsaa-token-store.js";
import { FixedClock } from "./test-support/fixed-clock.js";
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

const refusedAgo = (ms: number) => new Date(NOW.getTime() - ms);

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
    expect(store.operations).toEqual(["holdRenewal", "persistedToken", "releaseRenewal"]);
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

  it("holds the renewal across the request and the answer, and records the answer in one unit", async () => {
    const store = new FakeWsaaTokenStore();
    const { outcome } = renew(store, { kind: "issued", token: ISSUED });
    await outcome;

    expect(store.operations).toEqual([
      "holdRenewal",
      "persistedToken",
      "lastRefusal",
      "requestToken",
      "recordIssuedToken",
      "clearRefusal",
      "clearTicketHeldElsewhere",
      "resumeWorkWaitingOnToken",
      "commitAnswer",
      "releaseRenewal",
    ]);
  });

  it("holds the renewal while WSAA is called", async () => {
    const store = new FakeWsaaTokenStore();
    const { authentication, outcome } = renew(store, { kind: "issued", token: ISSUED });
    await outcome;

    expect(authentication.renewalHeldDuringRequest).toBe(true);
    expect(store.renewalHeld).toBe(false);
  });

  it("keeps the issued token when releasing the renewal fails afterwards", async () => {
    const store = new FakeWsaaTokenStore();
    store.failingRelease = true;
    const { outcome } = renew(store, { kind: "issued", token: ISSUED });

    await expect(outcome).rejects.toThrow("releaseRenewal failed");

    expect(store.rows).toEqual([
      { service: SERVICE, certificateFingerprint: FINGERPRINT, token: ISSUED },
    ]);
  });

  it("keeps a token per certificate", async () => {
    const store = new FakeWsaaTokenStore();
    store.seed(SERVICE, "other:fingerprint", persisted(HOUR_MS * 5));
    const { outcome } = renew(store, { kind: "issued", token: ISSUED });

    await expect(outcome).resolves.toEqual({ kind: "renewed" });

    expect(store.rows).toHaveLength(2);
  });

  describe("when WSAA still holds an earlier ticket", () => {
    it("records the refusal and opens the alert at the moment of the refusal when no ticket is stored", async () => {
      const store = new FakeWsaaTokenStore();
      const { outcome } = renew(store, { kind: "already_authenticated" });

      await expect(outcome).resolves.toEqual({ kind: "already_authenticated" });

      expect(store.refusedAt).toEqual(NOW);
      expect(store.ticketHeldElsewhere).toBe(true);
      expect(store.ticketHeldElsewhereChangedAt).toEqual(NOW);
      expect(store.ticketHeldElsewhereRetryIntervalMinutes).toBe(
        WSAA_ALREADY_AUTHENTICATED_RETRY_MINUTES,
      );
      expect(store.rows).toEqual([]);
      expect(store.resumeCount).toBe(0);
      expect(store.operations).toEqual([
        "holdRenewal",
        "persistedToken",
        "lastRefusal",
        "requestToken",
        "recordRefusal",
        "recordTicketHeldElsewhere",
        "commitAnswer",
        "releaseRenewal",
      ]);
    });

    it("does not call WSAA again just before the retry interval has passed", async () => {
      const store = new FakeWsaaTokenStore();
      store.refusedAt = refusedAgo(WSAA_ALREADY_AUTHENTICATED_RETRY_MS - 1);
      const { authentication, outcome } = renew(store, { kind: "issued", token: ISSUED });

      await expect(outcome).resolves.toEqual({ kind: "waiting" });

      expect(authentication.requestedServices).toEqual([]);
      expect(store.operations).toEqual([
        "holdRenewal",
        "persistedToken",
        "lastRefusal",
        "releaseRenewal",
      ]);
      expect(store.rows).toEqual([]);
    });

    it("asks WSAA again exactly when the retry interval has passed", async () => {
      const store = new FakeWsaaTokenStore();
      store.refusedAt = refusedAgo(WSAA_ALREADY_AUTHENTICATED_RETRY_MS);
      const { authentication, outcome } = renew(store, { kind: "already_authenticated" });

      await expect(outcome).resolves.toEqual({ kind: "already_authenticated" });

      expect(authentication.requestedServices).toEqual([SERVICE]);
      expect(store.refusedAt).toEqual(NOW);
    });

    it("records the ticket, clears the refusal, resolves the alert and resumes the waiting work when a later attempt is issued one", async () => {
      const store = new FakeWsaaTokenStore();
      store.refusedAt = refusedAgo(WSAA_ALREADY_AUTHENTICATED_RETRY_MS);
      store.ticketHeldElsewhere = true;
      const { outcome } = renew(store, { kind: "issued", token: ISSUED });

      await expect(outcome).resolves.toEqual({ kind: "renewed" });

      expect(store.rows).toEqual([
        { service: SERVICE, certificateFingerprint: FINGERPRINT, token: ISSUED },
      ]);
      expect(store.refusedAt).toBeNull();
      expect(store.ticketHeldElsewhere).toBe(false);
      expect(store.ticketHeldElsewhereChangedAt).toEqual(NOW);
      expect(store.resumeCount).toBe(1);
    });

    it("resumes the waiting work when the ticket replaces an expired one", async () => {
      const store = new FakeWsaaTokenStore();
      store.seed(SERVICE, FINGERPRINT, persisted(0));
      const { outcome } = renew(store, { kind: "issued", token: ISSUED });
      await outcome;

      expect(store.resumeCount).toBe(1);
    });

    it("records the refusal and opens the alert when WSAA refuses while only an expired ticket is stored", async () => {
      const store = new FakeWsaaTokenStore();
      store.seed(SERVICE, FINGERPRINT, persisted(0));
      const { outcome } = renew(store, { kind: "already_authenticated" });

      await expect(outcome).resolves.toEqual({ kind: "already_authenticated" });

      expect(store.refusedAt).toEqual(NOW);
      expect(store.ticketHeldElsewhere).toBe(true);
      expect(store.rows[0]?.token.token).toBe("old-token");
      expect(store.operations).toEqual([
        "holdRenewal",
        "persistedToken",
        "lastRefusal",
        "requestToken",
        "recordRefusal",
        "recordTicketHeldElsewhere",
        "commitAnswer",
        "releaseRenewal",
      ]);
    });

    it("does not call WSAA again before the retry interval has passed while only an expired ticket is stored", async () => {
      const store = new FakeWsaaTokenStore();
      store.seed(SERVICE, FINGERPRINT, persisted(0));
      store.refusedAt = refusedAgo(WSAA_ALREADY_AUTHENTICATED_RETRY_MS - 1);
      const { authentication, outcome } = renew(store, { kind: "issued", token: ISSUED });

      await expect(outcome).resolves.toEqual({ kind: "waiting" });

      expect(authentication.requestedServices).toEqual([]);
    });
  });

  describe("when WSAA fails", () => {
    it("records nothing and opens no alert", async () => {
      const store = new FakeWsaaTokenStore();
      const { outcome } = renew(store, { kind: "failed" });

      await expect(outcome).resolves.toEqual({ kind: "failed" });

      expect(store.operations).toEqual([
        "holdRenewal",
        "persistedToken",
        "lastRefusal",
        "requestToken",
        "releaseRenewal",
      ]);
      expect(store.rows).toEqual([]);
      expect(store.ticketHeldElsewhere).toBe(false);
      expect(store.refusedAt).toBeNull();
    });

    it("leaves an earlier refusal and its open alert as they were", async () => {
      const store = new FakeWsaaTokenStore();
      const refusedAt = refusedAgo(WSAA_ALREADY_AUTHENTICATED_RETRY_MS);
      store.refusedAt = refusedAt;
      store.ticketHeldElsewhere = true;
      const { outcome } = renew(store, { kind: "failed" });

      await expect(outcome).resolves.toEqual({ kind: "failed" });

      expect(store.refusedAt).toEqual(refusedAt);
      expect(store.ticketHeldElsewhere).toBe(true);
    });
  });

  describe("when recording the answer fails", () => {
    it("keeps the previous token, the refusal, the alert and the waiting work untouched", async () => {
      const store = new FakeWsaaTokenStore();
      store.seed(SERVICE, FINGERPRINT, persisted(0));
      store.refusedAt = refusedAgo(WSAA_ALREADY_AUTHENTICATED_RETRY_MS);
      store.ticketHeldElsewhere = true;
      store.failingOperation = "resumeWorkWaitingOnToken";
      const { outcome } = renew(store, { kind: "issued", token: ISSUED });

      await expect(outcome).rejects.toThrow("resumeWorkWaitingOnToken failed");

      expect(store.rows[0]?.token.token).toBe("old-token");
      expect(store.refusedAt).toEqual(refusedAgo(WSAA_ALREADY_AUTHENTICATED_RETRY_MS));
      expect(store.ticketHeldElsewhere).toBe(true);
      expect(store.resumeCount).toBe(0);
      expect(store.operations.slice(-2)).toEqual(["rollbackAnswer", "releaseRenewal"]);
    });

    it("keeps the previous token when recording the new one fails", async () => {
      const store = new FakeWsaaTokenStore();
      store.seed(SERVICE, FINGERPRINT, persisted(0));
      store.failingOperation = "recordIssuedToken";
      const { outcome } = renew(store, { kind: "issued", token: ISSUED });

      await expect(outcome).rejects.toThrow("recordIssuedToken failed");

      expect(store.rows[0]?.token.token).toBe("old-token");
    });

    it("records no refusal when opening the alert fails", async () => {
      const store = new FakeWsaaTokenStore();
      store.failingOperation = "recordTicketHeldElsewhere";
      const { outcome } = renew(store, { kind: "already_authenticated" });

      await expect(outcome).rejects.toThrow("recordTicketHeldElsewhere failed");

      expect(store.refusedAt).toBeNull();
      expect(store.ticketHeldElsewhere).toBe(false);
      expect(store.operations.slice(-2)).toEqual(["rollbackAnswer", "releaseRenewal"]);
    });
  });
});
