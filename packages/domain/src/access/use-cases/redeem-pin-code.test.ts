import { describe, expect, it } from "vitest";
import { redeemPinCode } from "./redeem-pin-code.js";
import {
  FakePinCodeStore,
  FakePinHasher,
  FixedClock,
  hashOfPinCode,
} from "./test-support/fake-pin-code-store.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const ISSUED = new Date("2026-09-29T11:55:00.000Z");
const EXPIRES = new Date("2026-09-29T12:10:00.000Z");

const CODE_HASH = hashOfPinCode("P4NX7KWE2QRT5MZD");
const SOURCE = "203.0.113.7";
const REGISTER = "register-1";
const NEW_PIN = "482913";

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function storeWithCode(
  overrides: Partial<{
    expiresAt: Date;
    redeemedAt: Date | null;
    supersededAt: Date | null;
    failedAttempts: number;
    active: boolean;
    hasPin: boolean;
  }> = {},
): FakePinCodeStore {
  const store = new FakePinCodeStore();
  store.seedUser(
    "person-1",
    { isAdministrator: false, active: overrides.active ?? true },
    { hasPin: overrides.hasPin ?? false },
  );
  store.seedCode({
    userId: "person-1",
    codeHash: CODE_HASH,
    issuedAt: ISSUED,
    expiresAt: overrides.expiresAt ?? EXPIRES,
    redeemedAt: overrides.redeemedAt ?? null,
    supersededAt: overrides.supersededAt ?? null,
    failedAttempts: overrides.failedAttempts ?? 0,
  });
  return store;
}

function redeem(
  store: FakePinCodeStore,
  input: Partial<{
    codeHash: string;
    newPin: string;
    registerId: string;
    sourceAddress: string;
  }> = {},
) {
  return redeemPinCode(
    { store, clock: new FixedClock(NOW), hasher: new FakePinHasher() },
    {
      codeHash: CODE_HASH,
      newPin: NEW_PIN,
      registerId: REGISTER,
      sourceAddress: SOURCE,
      ...input,
    },
  );
}

function seedAttempts(
  store: FakePinCodeStore,
  key: { kind: "register" | "source_address"; value: string },
  minutesAgoList: number[],
): void {
  for (const minutes of minutesAgoList) {
    store.seedAttempt({ key, attemptedAt: minutesAgo(minutes) });
  }
}

const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const TEN_OLDEST_FIFTY_MINUTES_AGO = [...NINE, 50];

describe("redeemPinCode", () => {
  describe("redeeming", () => {
    it("hands back the user's id and the salt and hash of the new PIN", async () => {
      const outcome = await redeem(storeWithCode());

      expect(outcome).toEqual({
        kind: "redeemed",
        userId: "person-1",
        salt: `salt-for-${NEW_PIN}`,
        pinHash: `hash-of-${NEW_PIN}`,
      });
    });

    it("gives a user without a PIN the first one, and replaces the PIN of a user who had one", async () => {
      const first = storeWithCode();
      const replacing = storeWithCode({ hasPin: true });

      await redeem(first);
      await redeem(replacing);

      const expected = new Map([
        ["person-1", { salt: `salt-for-${NEW_PIN}`, pinHash: `hash-of-${NEW_PIN}` }],
      ]);
      expect(first.snapshot().pins).toEqual(expected);
      expect(replacing.snapshot().pins).toEqual(expected);
    });

    it("records the PIN change for the user at the moment of redemption", async () => {
      const store = storeWithCode();

      await redeem(store);

      expect(store.snapshot().pinChanges).toEqual([{ userId: "person-1", changedAt: NOW }]);
    });

    it("marks the code redeemed at that moment and records who redeemed it, where and when", async () => {
      const store = storeWithCode();

      await redeem(store);

      expect(store.snapshot().codes[0]?.redeemedAt).toEqual(NOW);
      expect(store.snapshot().redemptions).toEqual([
        { userId: "person-1", registerId: REGISTER, redeemedAt: NOW },
      ]);
    });

    it("does not touch the failed attempts of the code it redeems", async () => {
      const store = storeWithCode({ failedAttempts: 3 });

      await redeem(store);

      expect(store.snapshot().codes[0]?.failedAttempts).toBe(3);
    });

    it("answers a repeat of the redemption that the code is burned, leaving the first PIN in place", async () => {
      const store = storeWithCode();
      await redeem(store);
      const afterFirst = store.snapshot();

      const outcome = await redeem(store, { newPin: "999999" });

      expect(outcome).toEqual({ kind: "burned" });
      expect(store.snapshot().pins).toEqual(afterFirst.pins);
      expect(store.snapshot().redemptions).toEqual(afterFirst.redemptions);
    });

    it("locks the code, then the attempts, before it writes the attempt, the PIN, the code and the audit entry in that order", async () => {
      const store = storeWithCode();

      await redeem(store);

      expect(store.operationOrder).toEqual([
        "lockPinCodeByHash",
        "lockPinCodeRedemptionAttempts",
        "acceptedPinCodeRedemptionAttempts",
        "acceptedPinCodeRedemptionAttempts",
        "recordPinCodeRedemptionAttempt",
        "replacePin",
        "markPinCodeRedeemed",
        "recordPinCodeRedemption",
      ]);
    });
  });

  describe("unknown code", () => {
    it("refuses a code nobody holds", async () => {
      const store = storeWithCode();

      const outcome = await redeem(store, { codeHash: hashOfPinCode("AAAAAAAAAAAAAAAA") });

      expect(outcome).toEqual({ kind: "unknown_code" });
      expect(store.snapshot().pins.size).toBe(0);
      expect(store.snapshot().codes[0]?.failedAttempts).toBe(0);
    });

    it("refuses the code of a user who is no longer active, counting nothing against the code", async () => {
      const store = storeWithCode({ active: false });

      const outcome = await redeem(store, { newPin: "12" });

      expect(outcome).toEqual({ kind: "unknown_code" });
      expect(store.snapshot().pins.size).toBe(0);
      expect(store.snapshot().codes[0]).toMatchObject({ failedAttempts: 0, redeemedAt: null });
    });
  });

  describe("burned code", () => {
    it.each([
      ["redeemed", { redeemedAt: minutesAgo(2) }],
      ["superseded by a newer one", { supersededAt: minutesAgo(2) }],
      ["failed five times", { failedAttempts: 5 }],
    ])("refuses a code that was %s, leaving everything as it was", async (_case, overrides) => {
      const store = storeWithCode(overrides);
      const before = store.snapshot();

      const outcome = await redeem(store);

      expect(outcome).toEqual({ kind: "burned" });
      expect(store.snapshot().pins).toEqual(before.pins);
      expect(store.snapshot().codes).toEqual(before.codes);
      expect(store.snapshot().redemptions).toEqual([]);
    });

    it("does not count a rejected new PIN against a code that is already burned", async () => {
      const store = storeWithCode({ redeemedAt: minutesAgo(2) });

      const outcome = await redeem(store, { newPin: "12" });

      expect(outcome).toEqual({ kind: "burned" });
      expect(store.snapshot().codes[0]?.failedAttempts).toBe(0);
    });

    it("keeps a code with four failed attempts usable", async () => {
      const outcome = await redeem(storeWithCode({ failedAttempts: 4 }));

      expect(outcome).toMatchObject({ kind: "redeemed" });
    });
  });

  describe("expired code", () => {
    it("refuses the code from the moment it expires", async () => {
      const store = storeWithCode({ expiresAt: NOW });

      const outcome = await redeem(store);

      expect(outcome).toEqual({ kind: "expired" });
      expect(store.snapshot().pins.size).toBe(0);
      expect(store.snapshot().codes[0]?.redeemedAt).toBeNull();
    });

    it("accepts the code up to one millisecond before it expires", async () => {
      const outcome = await redeem(storeWithCode({ expiresAt: new Date(NOW.getTime() + 1) }));

      expect(outcome).toMatchObject({ kind: "redeemed" });
    });

    it("does not count a rejected new PIN against an expired code", async () => {
      const store = storeWithCode({ expiresAt: NOW });

      await redeem(store, { newPin: "12" });

      expect(store.snapshot().codes[0]?.failedAttempts).toBe(0);
    });

    it("answers burned rather than expired for a code that is both", async () => {
      const outcome = await redeem(storeWithCode({ expiresAt: NOW, redeemedAt: minutesAgo(20) }));

      expect(outcome).toEqual({ kind: "burned" });
    });
  });

  describe("new PIN rejected", () => {
    it.each([
      ["too short", "12345"],
      ["empty", ""],
      ["not only digits", "12345a"],
    ])(
      "refuses a PIN that is %s, changing no PIN and keeping the code alive",
      async (_case, newPin) => {
        const store = storeWithCode({ hasPin: true });
        const pinsBefore = store.snapshot().pins;

        const outcome = await redeem(store, { newPin });

        expect(outcome).toEqual({ kind: "pin_rejected" });
        expect(store.snapshot().pins).toEqual(pinsBefore);
        expect(store.snapshot().pinChanges).toEqual([]);
        expect(store.snapshot().codes[0]).toMatchObject({ failedAttempts: 1, redeemedAt: null });
        expect(store.snapshot().redemptions).toEqual([]);
      },
    );

    it("lets the person retry with a valid PIN after a rejected one", async () => {
      const store = storeWithCode();
      await redeem(store, { newPin: "123" });

      const outcome = await redeem(store);

      expect(outcome).toMatchObject({ kind: "redeemed" });
    });

    it("burns the code on the fifth rejected PIN, so the right PIN no longer works", async () => {
      const store = storeWithCode();
      for (let attempt = 1; attempt <= 5; attempt++) {
        expect(await redeem(store, { newPin: "123" })).toEqual({ kind: "pin_rejected" });
      }

      const outcome = await redeem(store);

      expect(outcome).toEqual({ kind: "burned" });
      expect(store.snapshot().codes[0]?.failedAttempts).toBe(5);
      expect(store.snapshot().pins.size).toBe(0);
    });

    it("keeps the failed attempt when the outcome is a refusal", async () => {
      const store = storeWithCode({ failedAttempts: 4 });

      await redeem(store, { newPin: "123" });

      expect(store.snapshot().codes[0]?.failedAttempts).toBe(5);
    });
  });

  describe("attempt limit", () => {
    it("records the attempt for the register and the source address, whatever its outcome", async () => {
      const store = storeWithCode();

      await redeem(store, { codeHash: hashOfPinCode("AAAAAAAAAAAAAAAA") });

      expect(store.snapshot().attempts).toEqual([
        { key: { kind: "register", value: REGISTER }, attemptedAt: NOW },
        { key: { kind: "source_address", value: SOURCE }, attemptedAt: NOW },
      ]);
    });

    it("locks the register and the source address in a fixed order", async () => {
      const store = storeWithCode();

      await redeem(store);

      expect(store.lockedAttemptKeys).toEqual([
        { kind: "register", value: REGISTER },
        { kind: "source_address", value: SOURCE },
      ]);
    });

    it("accepts the tenth attempt of a register within the hour", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "register", value: REGISTER }, NINE);

      expect(await redeem(store)).toMatchObject({ kind: "redeemed" });
    });

    it("refuses the eleventh attempt of a register, saying when the oldest leaves the hour", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "register", value: REGISTER }, TEN_OLDEST_FIFTY_MINUTES_AGO);

      expect(await redeem(store)).toEqual({ kind: "rate_limited", retryAfterSeconds: 10 * 60 });
    });

    it("refuses the eleventh attempt from a source address, whichever register it comes from", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "source_address", value: SOURCE }, TEN_OLDEST_FIFTY_MINUTES_AGO);

      expect(await redeem(store)).toEqual({ kind: "rate_limited", retryAfterSeconds: 10 * 60 });
    });

    it("counts the attempts of another register and another address separately", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "register", value: "register-2" }, TEN_OLDEST_FIFTY_MINUTES_AGO);
      seedAttempts(
        store,
        { kind: "source_address", value: "198.51.100.1" },
        TEN_OLDEST_FIFTY_MINUTES_AGO,
      );

      expect(await redeem(store)).toMatchObject({ kind: "redeemed" });
    });

    it("keeps a register and a source address with the same text apart", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "register", value: SOURCE }, TEN_OLDEST_FIFTY_MINUTES_AGO);
      seedAttempts(
        store,
        { kind: "source_address", value: REGISTER },
        TEN_OLDEST_FIFTY_MINUTES_AGO,
      );

      expect(await redeem(store)).toMatchObject({ kind: "redeemed" });
    });

    it("waits for the longest of the two waits when both keys are over the limit", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "register", value: REGISTER }, [...NINE, 30]);
      seedAttempts(store, { kind: "source_address", value: SOURCE }, [...NINE, 50]);

      expect(await redeem(store)).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 * 60 });
    });

    it("waits for the longest wait whichever key holds it", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "register", value: REGISTER }, [...NINE, 50]);
      seedAttempts(store, { kind: "source_address", value: SOURCE }, [...NINE, 30]);

      expect(await redeem(store)).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 * 60 });
    });

    it("answers rate limited before it looks at the code, and changes nothing", async () => {
      const store = storeWithCode({ expiresAt: NOW });
      seedAttempts(store, { kind: "register", value: REGISTER }, TEN_OLDEST_FIFTY_MINUTES_AGO);
      const before = store.snapshot();

      const outcome = await redeem(store, { newPin: "12" });

      expect(outcome).toMatchObject({ kind: "rate_limited" });
      expect(store.snapshot()).toEqual(before);
    });

    it("does not count an attempt it refused", async () => {
      const store = storeWithCode();
      seedAttempts(store, { kind: "register", value: REGISTER }, TEN_OLDEST_FIFTY_MINUTES_AGO);

      await redeem(store);

      expect(store.snapshot().attempts).toHaveLength(10);
    });
  });

  describe("failed writes", () => {
    it.each([
      "recordPinCodeRedemptionAttempt",
      "replacePin",
      "markPinCodeRedeemed",
      "recordPinCodeRedemption",
    ] as const)("leaves nothing behind when %s fails", async (operation) => {
      const store = storeWithCode({ hasPin: true });
      store.failingWrites.add(operation);
      const before = store.snapshot();

      await expect(redeem(store)).rejects.toThrow(`${operation} failed`);

      expect(store.snapshot()).toEqual(before);
    });

    it("leaves nothing behind when counting a rejected PIN fails", async () => {
      const store = storeWithCode();
      store.failingWrites.add("recordFailedPinCodeRedemption");
      const before = store.snapshot();

      await expect(redeem(store, { newPin: "123" })).rejects.toThrow(
        "recordFailedPinCodeRedemption failed",
      );

      expect(store.snapshot()).toEqual(before);
    });
  });
});
