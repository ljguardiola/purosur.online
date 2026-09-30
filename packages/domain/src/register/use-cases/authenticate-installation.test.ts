import { describe, expect, it } from "vitest";
import { authenticateInstallation } from "./authenticate-installation.js";
import {
  derivedDeviceTokens,
  FakeRegisterStore,
  FixedClock,
  storedTokenOf,
} from "./test-support/fake-register-store.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const JUST_INSIDE_7_DAYS = new Date("2026-09-22T12:00:01.000Z");
const EXACTLY_7_DAYS_AGO = new Date("2026-09-22T12:00:00.000Z");
const MINUTES_AGO_5 = new Date("2026-09-29T11:55:00.000Z");
const HOURS_AGO_25 = new Date("2026-09-28T11:00:00.000Z");
const ENROLLED = new Date("2026-08-01T09:00:00.000Z");

const CURRENT = "cur.secret";
const PENDING = "pen.secret";

function storeWith(
  overrides: Partial<{
    currentIssuedAt: Date;
    pending: { token: string; issuedAt: Date } | null;
    revokedAt: Date | null;
  }> = {},
): FakeRegisterStore {
  const store = new FakeRegisterStore();
  const current = storedTokenOf(CURRENT, overrides.currentIssuedAt ?? HOURS_AGO_25);
  const pending = overrides.pending ?? null;
  store.seedInstallation({
    deviceId: "device-1",
    registerId: "register-1",
    tokenLookupPrefix: current.lookupPrefix,
    tokenHash: current.tokenHash,
    tokenIssuedAt: current.issuedAt,
    pendingToken: pending ? storedTokenOf(pending.token, pending.issuedAt) : null,
    hostname: "CAJA-MOSTRADOR",
    windowsVersion: "Windows 11 Pro 10.0.26100",
    enrolledAt: ENROLLED,
    revokedAt: overrides.revokedAt ?? null,
  });
  return store;
}

function authenticate(store: FakeRegisterStore, deviceToken: string) {
  return authenticateInstallation(
    { store, clock: new FixedClock(NOW), tokens: derivedDeviceTokens },
    { deviceToken },
  );
}

describe("authenticateInstallation", () => {
  it("recognizes the installation behind its current token, changing nothing", async () => {
    const store = storeWith();
    const before = store.snapshot();

    const outcome = await authenticate(store, CURRENT);

    expect(outcome).toEqual({ kind: "authenticated", deviceId: "device-1", revoked: false });
    expect(store.snapshot()).toEqual(before);
  });

  it("recognizes the current token until the last instant of its 7 days", async () => {
    const store = storeWith({ currentIssuedAt: JUST_INSIDE_7_DAYS });

    const outcome = await authenticate(store, CURRENT);

    expect(outcome).toEqual({ kind: "authenticated", deviceId: "device-1", revoked: false });
  });

  it("refuses the current token once its 7 days are over", async () => {
    const store = storeWith({ currentIssuedAt: EXACTLY_7_DAYS_AGO });

    const outcome = await authenticate(store, CURRENT);

    expect(outcome).toEqual({ kind: "rejected" });
  });

  it("promotes the pending token the first time it is used", async () => {
    const store = storeWith({ pending: { token: PENDING, issuedAt: MINUTES_AGO_5 } });

    const outcome = await authenticate(store, PENDING);

    const installation = store.snapshot().installations[0];
    expect(outcome).toEqual({ kind: "authenticated", deviceId: "device-1", revoked: false });
    expect(installation?.tokenLookupPrefix).toBe("pen");
    expect(installation?.pendingToken).toBeNull();
  });

  it("refuses the previous token once the new one was used", async () => {
    const store = storeWith({ pending: { token: PENDING, issuedAt: MINUTES_AGO_5 } });

    await authenticate(store, PENDING);
    const outcome = await authenticate(store, CURRENT);

    expect(outcome).toEqual({ kind: "rejected" });
  });

  it("keeps the previous token working while the new one is unused", async () => {
    const store = storeWith({ pending: { token: PENDING, issuedAt: MINUTES_AGO_5 } });
    const before = store.snapshot();

    const outcome = await authenticate(store, CURRENT);
    expect(store.snapshot()).toEqual(before);

    expect(outcome).toEqual({ kind: "authenticated", deviceId: "device-1", revoked: false });
  });

  it("refuses an expired pending token without promoting it", async () => {
    const store = storeWith({ pending: { token: PENDING, issuedAt: EXACTLY_7_DAYS_AGO } });
    const before = store.snapshot();

    const outcome = await authenticate(store, PENDING);

    expect(outcome).toEqual({ kind: "rejected" });
    expect(store.snapshot()).toEqual(before);
  });

  it("still recognizes a revoked installation, reporting it revoked", async () => {
    const store = storeWith({ revokedAt: MINUTES_AGO_5 });

    const outcome = await authenticate(store, CURRENT);

    expect(outcome).toEqual({ kind: "authenticated", deviceId: "device-1", revoked: true });
  });

  it.each([
    ["is malformed", "nodot"],
    ["has an unknown prefix", "other.secret"],
    ["has the right prefix and a wrong secret", "cur.wrong"],
  ])("refuses a token that %s, changing nothing", async (_case, deviceToken) => {
    const store = storeWith();
    const before = store.snapshot();

    const outcome = await authenticate(store, deviceToken);

    expect(outcome).toEqual({ kind: "rejected" });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves the installation as it was when promoting the pending token fails", async () => {
    const store = storeWith({ pending: { token: PENDING, issuedAt: MINUTES_AGO_5 } });
    store.failingWrites.add("promotePendingDeviceToken");
    const before = store.snapshot();

    await expect(authenticate(store, PENDING)).rejects.toThrow("promotePendingDeviceToken failed");

    expect(store.snapshot()).toEqual(before);
  });
});
