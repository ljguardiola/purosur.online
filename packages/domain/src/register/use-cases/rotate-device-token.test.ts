import { describe, expect, it } from "vitest";
import { rotateDeviceToken } from "./rotate-device-token.js";
import {
  derivedDeviceTokens,
  FakeRegisterStore,
  FixedClock,
  SequentialInstallationKeys,
  storedTokenOf,
} from "./test-support/fake-register-store.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const HOURS_AGO_25 = new Date("2026-09-28T11:00:00.000Z");
const DAYS_AGO_8 = new Date("2026-09-21T12:00:00.000Z");
const DAYS_AGO_7 = new Date("2026-09-22T12:00:00.000Z");
const MINUTES_AGO_5 = new Date("2026-09-29T11:55:00.000Z");
const ENROLLED = new Date("2026-08-01T09:00:00.000Z");

const CURRENT = "cur.secret";
const SUCCESSOR_OF_CURRENT = "next-of-cur.secret";
const PENDING = "pen.secret";
const SUCCESSOR_OF_PENDING = "next-of-pen.secret";
const OUTBOX_CHAIN_KEY = "outbox-chain-key";
const KEYS = {
  snapshotKeyVersions: [{ version: 1, key: "snapshot-1" }],
  contingencyTicketKey: { version: 1, key: "ticket-1" },
  outboxChainKey: OUTBOX_CHAIN_KEY,
};

function storeWith(
  overrides: Partial<{
    currentIssuedAt: Date;
    pending: { token: string; issuedAt: Date } | null;
    revokedAt: Date | null;
    outboxChainKey: string | null;
    registerKeys: boolean;
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
    outboxChainKey:
      overrides.outboxChainKey === undefined ? OUTBOX_CHAIN_KEY : overrides.outboxChainKey,
    hostname: "CAJA-MOSTRADOR",
    windowsVersion: "Windows 11 Pro 10.0.26100",
    enrolledAt: ENROLLED,
    revokedAt: overrides.revokedAt ?? null,
  });
  if (overrides.registerKeys ?? true) {
    store.seedSnapshotKey({ registerId: "register-1", version: 1, key: "snapshot-1" });
    store.seedContingencyTicketKey({ registerId: "register-1", version: 1, key: "ticket-1" });
  }
  return store;
}

function rotate(store: FakeRegisterStore, deviceToken: string) {
  return rotateDeviceToken(
    {
      store,
      clock: new FixedClock(NOW),
      tokens: derivedDeviceTokens,
      keys: new SequentialInstallationKeys(),
    },
    { deviceToken },
  );
}

describe("rotateDeviceToken", () => {
  it("hands out the successor of the current token and keeps it pending, issued now", async () => {
    const store = storeWith();

    const outcome = await rotate(store, CURRENT);

    expect(outcome).toEqual({ kind: "rotated", deviceToken: SUCCESSOR_OF_CURRENT, keys: KEYS });
    expect(store.snapshot().installations[0]?.pendingToken).toEqual(
      storedTokenOf(SUCCESSOR_OF_CURRENT, NOW),
    );
  });

  it("leaves the current token working until the new one is first used", async () => {
    const store = storeWith();

    await rotate(store, CURRENT);

    const installation = store.snapshot().installations[0];
    expect(installation?.tokenLookupPrefix).toBe("cur");
    expect(installation?.tokenIssuedAt).toEqual(HOURS_AGO_25);
  });

  it("gives back the same token, writing nothing, when the current token retries", async () => {
    const store = storeWith({ pending: { token: SUCCESSOR_OF_CURRENT, issuedAt: MINUTES_AGO_5 } });
    const before = store.snapshot();

    const outcome = await rotate(store, CURRENT);

    expect(outcome).toEqual({ kind: "rotated", deviceToken: SUCCESSOR_OF_CURRENT, keys: KEYS });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockInstallationByTokenPrefix", "lockRegisterKeys"]);
  });

  it("gives back the same token, issued anew, when the current token retries after its successor's 7 days ran out", async () => {
    const store = storeWith({
      currentIssuedAt: DAYS_AGO_8,
      pending: { token: SUCCESSOR_OF_CURRENT, issuedAt: DAYS_AGO_7 },
    });

    const outcome = await rotate(store, CURRENT);

    expect(outcome).toEqual({ kind: "rotated", deviceToken: SUCCESSOR_OF_CURRENT, keys: KEYS });
    expect(store.snapshot().installations[0]?.pendingToken).toEqual(
      storedTokenOf(SUCCESSOR_OF_CURRENT, NOW),
    );
  });

  it("replaces a pending token that is not the successor of the presented one", async () => {
    const store = storeWith({ pending: { token: "stale.secret", issuedAt: MINUTES_AGO_5 } });

    const outcome = await rotate(store, CURRENT);

    expect(outcome).toEqual({ kind: "rotated", deviceToken: SUCCESSOR_OF_CURRENT, keys: KEYS });
    expect(store.snapshot().installations[0]?.pendingToken).toEqual(
      storedTokenOf(SUCCESSOR_OF_CURRENT, NOW),
    );
  });

  it("promotes the pending token when it is presented, then rotates from it", async () => {
    const store = storeWith({ pending: { token: PENDING, issuedAt: MINUTES_AGO_5 } });

    const outcome = await rotate(store, PENDING);

    const installation = store.snapshot().installations[0];
    expect(outcome).toEqual({ kind: "rotated", deviceToken: SUCCESSOR_OF_PENDING, keys: KEYS });
    expect(installation?.tokenLookupPrefix).toBe("pen");
    expect(installation?.tokenIssuedAt).toEqual(MINUTES_AGO_5);
    expect(installation?.pendingToken).toEqual(storedTokenOf(SUCCESSOR_OF_PENDING, NOW));
  });

  it("promotes the pending token before it records the next one", async () => {
    const store = storeWith({ pending: { token: PENDING, issuedAt: MINUTES_AGO_5 } });

    await rotate(store, PENDING);

    expect(store.operationOrder).toEqual([
      "lockInstallationByTokenPrefix",
      "promotePendingDeviceToken",
      "recordPendingDeviceToken",
      "lockRegisterKeys",
    ]);
  });

  it("hands back every snapshot key version and the latest contingency-ticket key the register holds now, with the installation's own outbox-chain key", async () => {
    const store = storeWith();
    store.seedSnapshotKey({ registerId: "register-1", version: 2, key: "snapshot-2" });
    store.seedContingencyTicketKey({ registerId: "register-1", version: 2, key: "ticket-2" });
    store.seedSnapshotKey({ registerId: "register-other", version: 3, key: "other-snapshot" });
    store.seedContingencyTicketKey({ registerId: "register-other", version: 3, key: "other" });

    const outcome = await rotate(store, CURRENT);

    expect(outcome).toEqual({
      kind: "rotated",
      deviceToken: SUCCESSOR_OF_CURRENT,
      keys: {
        snapshotKeyVersions: [
          { version: 1, key: "snapshot-1" },
          { version: 2, key: "snapshot-2" },
        ],
        contingencyTicketKey: { version: 2, key: "ticket-2" },
        outboxChainKey: OUTBOX_CHAIN_KEY,
      },
    });
  });

  it("generates and keeps the keys of an installation enrolled before it was handed any", async () => {
    const store = storeWith({ outboxChainKey: null, registerKeys: false });

    const outcome = await rotate(store, CURRENT);

    expect(outcome).toEqual({
      kind: "rotated",
      deviceToken: SUCCESSOR_OF_CURRENT,
      keys: {
        snapshotKeyVersions: [{ version: 1, key: "key-1" }],
        contingencyTicketKey: { version: 1, key: "key-2" },
        outboxChainKey: "key-3",
      },
    });
    const state = store.snapshot();
    expect(state.installations[0]?.outboxChainKey).toBe("key-3");
    expect(state.snapshotKeys).toEqual([{ registerId: "register-1", version: 1, key: "key-1" }]);
    expect(state.contingencyTicketKeys).toEqual([
      { registerId: "register-1", version: 1, key: "key-2" },
    ]);
  });

  it("locks the installation before its register's keys", async () => {
    const store = storeWith({ outboxChainKey: null, registerKeys: false });

    await rotate(store, CURRENT);

    expect(store.operationOrder).toEqual([
      "lockInstallationByTokenPrefix",
      "recordPendingDeviceToken",
      "lockRegisterKeys",
      "recordSnapshotKey",
      "recordContingencyTicketKey",
      "recordOutboxChainKey",
    ]);
  });

  it.each(["recordSnapshotKey", "recordContingencyTicketKey", "recordOutboxChainKey"] as const)(
    "leaves everything as it was when %s fails",
    async (operation) => {
      const store = storeWith({ outboxChainKey: null, registerKeys: false });
      store.failingWrites.add(operation);
      const before = store.snapshot();

      await expect(rotate(store, CURRENT)).rejects.toThrow(`${operation} failed`);

      expect(store.snapshot()).toEqual(before);
    },
  );

  it("rotates a token whose 7 days ran out", async () => {
    const store = storeWith({ currentIssuedAt: DAYS_AGO_8 });

    const outcome = await rotate(store, CURRENT);

    expect(outcome).toEqual({ kind: "rotated", deviceToken: SUCCESSOR_OF_CURRENT, keys: KEYS });
  });

  it.each([
    ["is malformed", "nodot"],
    ["has no secret", "cur."],
    ["has an unknown prefix", "other.secret"],
    ["has the right prefix and a wrong secret", "cur.wrong"],
  ])("refuses a token that %s, writing nothing", async (_case, deviceToken) => {
    const store = storeWith();
    const before = store.snapshot();

    const outcome = await rotate(store, deviceToken);

    expect(outcome).toEqual({ kind: "token_rejected" });
    expect(store.snapshot()).toEqual(before);
    expect(
      store.operationOrder.filter((operation) => operation !== "lockInstallationByTokenPrefix"),
    ).toEqual([]);
  });

  it("refuses a pending token with the right prefix and a wrong secret", async () => {
    const store = storeWith({ pending: { token: PENDING, issuedAt: MINUTES_AGO_5 } });
    const before = store.snapshot();

    const outcome = await rotate(store, "pen.wrong");

    expect(outcome).toEqual({ kind: "token_rejected" });
    expect(store.snapshot()).toEqual(before);
  });

  it.each([
    ["current", CURRENT, null],
    ["pending", PENDING, { token: PENDING, issuedAt: MINUTES_AGO_5 }],
  ])(
    "refuses the %s token of a revoked installation, writing nothing",
    async (_which, token, pending) => {
      const store = storeWith({ revokedAt: MINUTES_AGO_5, pending });
      const before = store.snapshot();

      const outcome = await rotate(store, token);

      expect(outcome).toEqual({ kind: "token_rejected" });
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("does not look anything up for a malformed token", async () => {
    const store = storeWith();

    await rotate(store, "nodot");

    expect(store.operationOrder).toEqual([]);
  });

  it("leaves the installation as it was when recording the new token fails", async () => {
    const store = storeWith({ pending: { token: PENDING, issuedAt: MINUTES_AGO_5 } });
    store.failingWrites.add("recordPendingDeviceToken");
    const before = store.snapshot();

    await expect(rotate(store, PENDING)).rejects.toThrow("recordPendingDeviceToken failed");

    expect(store.snapshot()).toEqual(before);
  });
});
