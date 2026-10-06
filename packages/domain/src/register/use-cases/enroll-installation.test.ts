import { describe, expect, it } from "vitest";
import { enrollInstallation } from "./enroll-installation.js";
import {
  FakeRegisterStore,
  FixedClock,
  hashOfCode,
  plainCodeHashes,
  SequentialDeviceTokens,
  SequentialInstallationKeys,
} from "./test-support/fake-register-store.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const ISSUED = new Date("2026-09-29T11:55:00.000Z");
const EXPIRES = new Date("2026-09-29T12:10:00.000Z");
const EARLIER = new Date("2026-09-01T09:00:00.000Z");

const CODE = "P4NX7KWE2QRT6MZD";
const SAME_GROUP_OTHER_CODE = "P4NXAAAAAAAAAAAA";
const SOURCE = "203.0.113.7";

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function storeWithCode(
  overrides: Partial<{
    redeemedAt: Date | null;
    expiresAt: Date;
    failedAttempts: number;
    registerId: string;
    code: string;
  }> = {},
): FakeRegisterStore {
  const store = new FakeRegisterStore();
  const code = overrides.code ?? CODE;
  store.seedCode({
    registerId: overrides.registerId ?? "register-1",
    lookup: code.slice(0, 4),
    codeHash: hashOfCode(code),
    expiresAt: overrides.expiresAt ?? EXPIRES,
    redeemedAt: overrides.redeemedAt ?? null,
    failedAttempts: overrides.failedAttempts ?? 0,
  });
  return store;
}

function enroll(store: FakeRegisterStore, code = CODE, sourceAddress = SOURCE) {
  return enrollInstallation(
    {
      store,
      clock: new FixedClock(NOW),
      tokens: new SequentialDeviceTokens(),
      codes: plainCodeHashes,
      keys: new SequentialInstallationKeys(),
    },
    {
      code,
      sourceAddress,
      hostname: "CAJA-MOSTRADOR",
      windowsVersion: "Windows 11 Pro 10.0.26100",
    },
  );
}

function seedAttempts(
  store: FakeRegisterStore,
  key: { kind: "source_address" | "register"; value: string },
  minutesAgoList: number[],
): void {
  for (const minutes of minutesAgoList) {
    store.seedAttempt({ key, attemptedAt: minutesAgo(minutes) });
  }
}

function previousInstallation() {
  return {
    deviceId: "device-old",
    registerId: "register-1",
    tokenLookupPrefix: "old",
    tokenHash: "old-hash",
    tokenIssuedAt: EARLIER,
    pendingToken: null,
    outboxChainKey: null,
    hostname: "VIEJA",
    windowsVersion: "Windows 10",
    enrolledAt: EARLIER,
    revokedAt: null,
  };
}

const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const TEN_OLDEST_FIFTY_MINUTES_AGO = [...NINE, 50];

describe("enrollInstallation", () => {
  it("enrolls the installation for the code's register and hands it a device id, a token and its keys", async () => {
    const store = storeWithCode();

    const outcome = await enroll(store);

    expect(outcome).toEqual({
      kind: "enrolled",
      registerId: "register-1",
      deviceId: "device-1",
      deviceToken: "prefix-1.secret-1",
      keys: {
        snapshotKeyVersions: [{ version: 1, key: "key-1" }],
        contingencyTicketKey: { version: 1, key: "key-2" },
        outboxChainKey: "key-3",
      },
    });
  });

  it("generates the first snapshot and contingency-ticket keys of a register that has none, and keeps them for the register", async () => {
    const store = storeWithCode();

    await enroll(store);

    expect(store.snapshot().snapshotKeys).toEqual([
      { registerId: "register-1", version: 1, key: "key-1" },
    ]);
    expect(store.snapshot().contingencyTicketKeys).toEqual([
      { registerId: "register-1", version: 1, key: "key-2" },
    ]);
  });

  it("hands over every snapshot key version and the latest contingency-ticket key the register already holds, generating none of them", async () => {
    const store = storeWithCode();
    store.seedSnapshotKey({ registerId: "register-1", version: 2, key: "snapshot-2" });
    store.seedSnapshotKey({ registerId: "register-1", version: 1, key: "snapshot-1" });
    store.seedSnapshotKey({ registerId: "register-other", version: 3, key: "other-snapshot" });
    store.seedContingencyTicketKey({ registerId: "register-1", version: 2, key: "ticket-2" });
    store.seedContingencyTicketKey({ registerId: "register-1", version: 1, key: "ticket-1" });
    store.seedContingencyTicketKey({ registerId: "register-other", version: 3, key: "other" });
    const before = store.snapshot();

    const outcome = await enroll(store);

    expect(outcome).toMatchObject({
      keys: {
        snapshotKeyVersions: [
          { version: 1, key: "snapshot-1" },
          { version: 2, key: "snapshot-2" },
        ],
        contingencyTicketKey: { version: 2, key: "ticket-2" },
        outboxChainKey: "key-1",
      },
    });
    expect(store.snapshot().snapshotKeys).toEqual(before.snapshotKeys);
    expect(store.snapshot().contingencyTicketKeys).toEqual(before.contingencyTicketKeys);
    expect(store.operationOrder).not.toContain("recordSnapshotKey");
    expect(store.operationOrder).not.toContain("recordContingencyTicketKey");
  });

  it("gives a new installation of the register its own outbox-chain key, while the register keeps its keys", async () => {
    const store = storeWithCode();
    store.seedSnapshotKey({ registerId: "register-1", version: 1, key: "snapshot-1" });
    store.seedContingencyTicketKey({ registerId: "register-1", version: 1, key: "ticket-1" });
    store.seedInstallation({
      deviceId: "device-old",
      registerId: "register-1",
      tokenLookupPrefix: "old",
      tokenHash: "hash-old",
      tokenIssuedAt: EARLIER,
      pendingToken: null,
      outboxChainKey: "old-outbox-chain-key",
      hostname: "CAJA-VIEJA",
      windowsVersion: "Windows 10",
      enrolledAt: EARLIER,
      revokedAt: null,
    });

    const outcome = await enroll(store);

    expect(outcome).toMatchObject({
      keys: {
        snapshotKeyVersions: [{ version: 1, key: "snapshot-1" }],
        contingencyTicketKey: { version: 1, key: "ticket-1" },
        outboxChainKey: "key-1",
      },
    });
    const installations = store.snapshot().installations;
    expect(installations.find((row) => row.deviceId === "device-1")?.outboxChainKey).toBe("key-1");
    expect(installations.find((row) => row.deviceId === "device-old")?.outboxChainKey).toBe(
      "old-outbox-chain-key",
    );
  });

  it.each([
    ["a wrong code", "P4NXZZZZZZZZZZZZ"],
    ["a code of another group", "AAAAAAAAAAAAAAAA"],
  ])("generates and hands over no key for %s", async (_case, code) => {
    const store = storeWithCode();

    const outcome = await enroll(store, code);

    expect(outcome).toEqual({ kind: "code_rejected" });
    expect(store.snapshot().snapshotKeys).toEqual([]);
    expect(store.snapshot().contingencyTicketKeys).toEqual([]);
    expect(store.operationOrder).not.toContain("lockRegisterKeys");
  });

  it("keeps only the token's hash and lookup prefix, with the hostname and Windows version reported", async () => {
    const store = storeWithCode();

    await enroll(store);

    expect(store.snapshot().installations).toEqual([
      {
        deviceId: "device-1",
        registerId: "register-1",
        tokenLookupPrefix: "prefix-1",
        tokenHash: "hash-of-token-1",
        tokenIssuedAt: NOW,
        pendingToken: null,
        outboxChainKey: "key-3",
        hostname: "CAJA-MOSTRADOR",
        windowsVersion: "Windows 11 Pro 10.0.26100",
        enrolledAt: NOW,
        revokedAt: null,
      },
    ]);
  });

  it("redeems the code so it can't be used again", async () => {
    const store = storeWithCode();

    await enroll(store);
    const again = await enroll(store);

    expect(store.snapshot().codes[0]?.redeemedAt).toEqual(NOW);
    expect(again).toEqual({ kind: "code_rejected" });
  });

  it("revokes the installation that held the register before, at the moment it enrolls the new one", async () => {
    const store = storeWithCode();
    const previous = {
      registerId: "register-1",
      tokenLookupPrefix: "old",
      tokenHash: "old-hash",
      tokenIssuedAt: EARLIER,
      pendingToken: null,
      outboxChainKey: null,
      hostname: "VIEJA",
      windowsVersion: "Windows 10 Pro 10.0.19045",
      enrolledAt: EARLIER,
    };
    store.seedInstallation({ ...previous, deviceId: "device-old", revokedAt: null });
    store.seedInstallation({
      ...previous,
      registerId: "register-2",
      deviceId: "device-other-register",
      revokedAt: null,
    });

    await enroll(store);

    const installations = store.snapshot().installations;
    expect(installations.find((row) => row.deviceId === "device-old")?.revokedAt).toEqual(NOW);
    expect(
      installations.find((row) => row.deviceId === "device-other-register")?.revokedAt,
    ).toBeNull();
    expect(installations.find((row) => row.deviceId === "device-1")?.revokedAt).toBeNull();
  });

  it("revokes the previous installation, then locks the register's keys, before it records the new one, and opens the alert last", async () => {
    const store = storeWithCode();

    await enroll(store);

    expect(store.operationOrder.slice(-8)).toEqual([
      "revokeActiveInstallation",
      "lockRegisterKeys",
      "recordSnapshotKey",
      "recordContingencyTicketKey",
      "recordInstallation",
      "recordInstallationEnrollment",
      "markEnrollmentCodeRedeemed",
      "openEnrollmentAlert",
    ]);
  });

  it("records the revocation right after revoking, and the enrollment right after recording the installation", async () => {
    const store = storeWithCode();
    store.seedInstallation(previousInstallation());

    await enroll(store);

    const order = store.operationOrder;
    expect(order.slice(order.indexOf("revokeActiveInstallation"))).toEqual([
      "revokeActiveInstallation",
      "recordInstallationRevocation",
      "lockRegisterKeys",
      "recordSnapshotKey",
      "recordContingencyTicketKey",
      "recordInstallation",
      "recordInstallationEnrollment",
      "markEnrollmentCodeRedeemed",
      "openEnrollmentAlert",
    ]);
  });

  it("records the revocation of the installation it replaced and the enrollment of the new one", async () => {
    const store = storeWithCode();
    store.seedInstallation(previousInstallation());

    await enroll(store);

    expect(store.snapshot().installationRevocations).toEqual([
      { registerId: "register-1", deviceId: "device-old", revokedAt: NOW },
    ]);
    expect(store.snapshot().installationEnrollments).toEqual([
      {
        registerId: "register-1",
        deviceId: "device-1",
        hostname: "CAJA-MOSTRADOR",
        windowsVersion: "Windows 11 Pro 10.0.26100",
        replacedDeviceId: "device-old",
        enrolledAt: NOW,
      },
    ]);
  });

  it("records no revocation and an enrollment that replaced nothing on a register nothing held", async () => {
    const store = storeWithCode();

    await enroll(store);

    expect(store.snapshot().installationRevocations).toEqual([]);
    expect(store.snapshot().installationEnrollments).toEqual([
      expect.objectContaining({ deviceId: "device-1", replacedDeviceId: null }),
    ]);
  });

  it("records no revocation and no enrollment when the code is refused or the attempt is rate limited", async () => {
    const refused = storeWithCode({ redeemedAt: EARLIER });
    refused.seedInstallation(previousInstallation());
    const limited = storeWithCode();
    limited.seedInstallation(previousInstallation());
    seedAttempts(limited, { kind: "source_address", value: SOURCE }, [...NINE, 10]);

    await enroll(refused);
    await enroll(limited);

    for (const store of [refused, limited]) {
      expect(store.snapshot().installationRevocations).toEqual([]);
      expect(store.snapshot().installationEnrollments).toEqual([]);
    }
  });

  it("opens the register's enrollment alert for the new installation, on a register nothing held before", async () => {
    const store = storeWithCode();

    await enroll(store);

    expect(store.snapshot().enrollmentAlerts).toEqual([
      {
        registerId: "register-1",
        deviceId: "device-1",
        hostname: "CAJA-MOSTRADOR",
        windowsVersion: "Windows 11 Pro 10.0.26100",
        replacedInstallation: false,
        enrolledAt: NOW,
      },
    ]);
  });

  it("tells the enrollment alert that the new installation replaced the one that held the register", async () => {
    const store = storeWithCode();
    store.seedInstallation({
      registerId: "register-1",
      tokenLookupPrefix: "old",
      tokenHash: "old-hash",
      hostname: "VIEJA",
      windowsVersion: "Windows 10 Pro 10.0.19045",
      enrolledAt: EARLIER,
      tokenIssuedAt: EARLIER,
      pendingToken: null,
      outboxChainKey: null,
      deviceId: "device-old",
      revokedAt: null,
    });

    await enroll(store);

    expect(store.snapshot().enrollmentAlerts).toEqual([
      expect.objectContaining({ registerId: "register-1", replacedInstallation: true }),
    ]);
  });

  it("does not count an installation already revoked, or one of another register, as replaced", async () => {
    const store = storeWithCode();
    const previous = {
      tokenLookupPrefix: "old",
      tokenHash: "old-hash",
      hostname: "VIEJA",
      windowsVersion: "Windows 10 Pro 10.0.19045",
      enrolledAt: EARLIER,
      tokenIssuedAt: EARLIER,
      pendingToken: null,
      outboxChainKey: null,
    };
    store.seedInstallation({
      ...previous,
      registerId: "register-1",
      deviceId: "device-revoked",
      revokedAt: EARLIER,
    });
    store.seedInstallation({
      ...previous,
      registerId: "register-2",
      deviceId: "device-other-register",
      revokedAt: null,
    });

    await enroll(store);

    expect(store.snapshot().enrollmentAlerts).toEqual([
      expect.objectContaining({ registerId: "register-1", replacedInstallation: false }),
    ]);
  });

  it("opens no enrollment alert when the code is refused or the attempt is rate limited", async () => {
    const refused = storeWithCode({ redeemedAt: EARLIER });
    const limited = storeWithCode();
    seedAttempts(limited, { kind: "source_address", value: SOURCE }, [...NINE, 10]);

    expect(await enroll(refused)).toEqual({ kind: "code_rejected" });
    expect((await enroll(limited)).kind).toBe("rate_limited");

    expect(refused.snapshot().enrollmentAlerts).toEqual([]);
    expect(limited.snapshot().enrollmentAlerts).toEqual([]);
  });

  it.each([
    ["has expired", { expiresAt: NOW }],
    ["was already redeemed", { redeemedAt: ISSUED }],
    ["failed 5 times", { failedAttempts: 5 }],
  ])("refuses a code that %s, creating or changing no installation", async (_case, overrides) => {
    const store = storeWithCode(overrides);
    store.seedInstallation({
      deviceId: "device-old",
      registerId: "register-1",
      tokenLookupPrefix: "old",
      tokenHash: "old-hash",
      tokenIssuedAt: EARLIER,
      pendingToken: null,
      outboxChainKey: null,
      hostname: "VIEJA",
      windowsVersion: "Windows 10",
      enrolledAt: EARLIER,
      revokedAt: null,
    });
    const before = store.snapshot();

    const outcome = await enroll(store);

    expect(outcome).toEqual({ kind: "code_rejected" });
    expect(store.snapshot().installations).toEqual(before.installations);
    expect(store.snapshot().codes).toEqual(before.codes);
  });

  it("counts a mistyped code against the code whose first group it shares", async () => {
    const store = storeWithCode({ failedAttempts: 3 });

    const outcome = await enroll(store, SAME_GROUP_OTHER_CODE);

    expect(outcome).toEqual({ kind: "code_rejected" });
    expect(store.snapshot().codes[0]?.failedAttempts).toBe(4);
    expect(store.snapshot().installations).toEqual([]);
  });

  it("burns the code on its fifth failed attempt, so the right code no longer works", async () => {
    const store = storeWithCode();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await enroll(store, SAME_GROUP_OTHER_CODE);
    }
    const outcome = await enroll(store);

    expect(outcome).toEqual({ kind: "code_rejected" });
    expect(store.snapshot().installations).toEqual([]);
  });

  it("stops counting failed attempts once the code no longer works", async () => {
    const store = storeWithCode({ expiresAt: NOW, failedAttempts: 2 });

    await enroll(store, SAME_GROUP_OTHER_CODE);

    expect(store.snapshot().codes[0]?.failedAttempts).toBe(2);
    expect(store.operationOrder).not.toContain("recordFailedEnrollmentAttempt");
  });

  it("refuses a code whose first group matches no code, counting it against no code", async () => {
    const store = storeWithCode();

    const outcome = await enroll(store, "ZZZZ7KWE2QRT6MZD");

    expect(outcome).toEqual({ kind: "code_rejected" });
    expect(store.snapshot().codes[0]?.failedAttempts).toBe(0);
    expect(store.operationOrder).not.toContain("recordFailedEnrollmentAttempt");
  });

  it("enrolls the register whose code matches when two codes share their first group", async () => {
    const store = storeWithCode({ registerId: "register-1", code: SAME_GROUP_OTHER_CODE });
    store.seedCode({
      registerId: "register-2",
      lookup: CODE.slice(0, 4),
      codeHash: hashOfCode(CODE),
      expiresAt: EXPIRES,
      redeemedAt: null,
      failedAttempts: 0,
    });

    const outcome = await enroll(store);

    expect(outcome).toMatchObject({ kind: "enrolled", registerId: "register-2" });
    expect(store.snapshot().codes.map((code) => code.failedAttempts)).toEqual([0, 0]);
  });

  it("counts a mistyped code against every usable code sharing its first group", async () => {
    const store = storeWithCode({ registerId: "register-1" });
    store.seedCode({
      registerId: "register-2",
      lookup: CODE.slice(0, 4),
      codeHash: hashOfCode("P4NXBBBBBBBBBBBB"),
      expiresAt: EXPIRES,
      redeemedAt: null,
      failedAttempts: 1,
    });

    await enroll(store, SAME_GROUP_OTHER_CODE);

    expect(store.snapshot().codes.map((code) => code.failedAttempts)).toEqual([1, 2]);
  });

  describe("attempt limit", () => {
    it("records each accepted attempt against its source address and the register it reached", async () => {
      const store = storeWithCode();

      await enroll(store, SAME_GROUP_OTHER_CODE);

      expect(store.snapshot().attempts).toEqual([
        { key: { kind: "source_address", value: SOURCE }, attemptedAt: NOW },
        { key: { kind: "register", value: "register-1" }, attemptedAt: NOW },
      ]);
    });

    it("records an attempt that reached no register against its source address only", async () => {
      const store = storeWithCode();

      await enroll(store, "ZZZZ7KWE2QRT6MZD");

      expect(store.snapshot().attempts).toEqual([
        { key: { kind: "source_address", value: SOURCE }, attemptedAt: NOW },
      ]);
    });

    it("accepts the tenth attempt of the hour from the same source address", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "source_address", value: SOURCE }, NINE);

      expect(await enroll(store)).toMatchObject({ kind: "enrolled" });
    });

    it("refuses an attempt from a source address that made 10 in the hour, writing nothing", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "source_address", value: SOURCE }, TEN_OLDEST_FIFTY_MINUTES_AGO);
      const before = store.snapshot();

      const outcome = await enroll(store);

      expect(outcome).toEqual({ kind: "rate_limited", retryAfterSeconds: 10 * 60 });
      expect(store.snapshot()).toEqual(before);
    });

    it("refuses an attempt at a register that received 10 in the hour from other addresses", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "register", value: "register-1" }, TEN_OLDEST_FIFTY_MINUTES_AGO);

      const outcome = await enroll(store, CODE, "198.51.100.1");

      expect(outcome).toEqual({ kind: "rate_limited", retryAfterSeconds: 10 * 60 });
      expect(store.snapshot().installations).toEqual([]);
    });

    it("counts another register's attempts only against that register", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "register", value: "register-2" }, TEN_OLDEST_FIFTY_MINUTES_AGO);
      seedAttempts(
        store,
        { kind: "source_address", value: "198.51.100.1" },
        TEN_OLDEST_FIFTY_MINUTES_AGO,
      );

      expect(await enroll(store)).toMatchObject({ kind: "enrolled" });
    });

    it("waits for whichever limit frees up last", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "source_address", value: SOURCE }, [...NINE, 50]);
      seedAttempts(store, { kind: "register", value: "register-1" }, [...NINE, 30]);

      expect(await enroll(store)).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 * 60 });
    });

    it("waits for the source address's limit when it frees up after the register's", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "source_address", value: SOURCE }, [...NINE, 30]);
      seedAttempts(store, { kind: "register", value: "register-1" }, [...NINE, 50]);

      expect(await enroll(store)).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 * 60 });
    });

    it("no longer counts attempts older than an hour", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "source_address", value: SOURCE }, [...NINE, 60]);

      expect(await enroll(store)).toMatchObject({ kind: "enrolled" });
    });

    it("refuses as a rate limit before it looks at whether the code works", async () => {
      const store = storeWithCode({ failedAttempts: 5 });
      seedAttempts(store, { kind: "source_address", value: SOURCE }, TEN_OLDEST_FIFTY_MINUTES_AGO);

      expect(await enroll(store)).toMatchObject({ kind: "rate_limited" });
    });
  });

  describe("locks", () => {
    it("locks the codes sharing the first group before the attempt counters, then counts", async () => {
      const store = storeWithCode();

      await enroll(store);

      expect(store.operationOrder.slice(0, 5)).toEqual([
        "lockEnrollmentCodes",
        "lockEnrollmentAttempts",
        "acceptedEnrollmentAttempts",
        "acceptedEnrollmentAttempts",
        "recordEnrollmentAttempt",
      ]);
    });

    it("locks the counters of the source address and of every register the code reached", async () => {
      const store = storeWithCode({ registerId: "register-1" });
      store.seedCode({
        registerId: "register-2",
        lookup: CODE.slice(0, 4),
        codeHash: hashOfCode("P4NXBBBBBBBBBBBB"),
        expiresAt: EXPIRES,
        redeemedAt: null,
        failedAttempts: 0,
      });

      await enroll(store);

      expect(store.lockedAttemptKeys).toEqual([
        { kind: "source_address", value: SOURCE },
        { kind: "register", value: "register-1" },
        { kind: "register", value: "register-2" },
      ]);
    });
  });

  it.each([
    "revokeActiveInstallation",
    "recordInstallationRevocation",
    "recordSnapshotKey",
    "recordContingencyTicketKey",
    "recordInstallation",
    "recordInstallationEnrollment",
    "markEnrollmentCodeRedeemed",
    "openEnrollmentAlert",
  ] as const)("leaves everything as it was when %s fails", async (operation) => {
    const store = storeWithCode();
    store.seedInstallation(previousInstallation());
    store.failingWrites.add(operation);
    const before = store.snapshot();

    await expect(enroll(store)).rejects.toThrow(`${operation} failed`);

    expect(store.snapshot()).toEqual(before);
  });
});
