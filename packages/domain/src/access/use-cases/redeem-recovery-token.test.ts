import { describe, expect, it } from "vitest";
import { redeemRecoveryToken } from "./redeem-recovery-token.js";
import {
  FakeRecoveryRedemptionStore,
  type FakeRecoveryToken,
} from "./test-support/fake-recovery-redemption-store.js";

const REDEEMED_AT = new Date("2026-10-01T12:00:00.000Z");
const TOKEN_HASH = "hash-1";
const ALERTED_AT = new Date("2026-10-01T12:00:03.000Z");

function storedToken(overrides: Partial<FakeRecoveryToken> = {}): FakeRecoveryToken {
  return {
    id: "token-1",
    tokenHash: TOKEN_HASH,
    userId: "u-1",
    expiresAt: new Date(REDEEMED_AT.getTime() + 60_000),
    usedAt: null,
    voidedAt: null,
    registrationChallenge: "challenge-1",
    ...overrides,
  };
}

const PASSKEY = {
  credentialId: "cred-new",
  publicKey: "public-key",
  counter: 3,
  transports: ["internal"],
  deviceType: "multiDevice",
  backedUp: true,
  name: "Laptop",
};

function fixture(token: Partial<FakeRecoveryToken> | null = {}) {
  const store = new FakeRecoveryRedemptionStore();
  if (token) {
    store.seedToken(storedToken(token));
  }
  store.seedAccount({ id: "u-1", firstName: "Ada", email: "ada@example.test", active: true });
  store.seedSession({ id: "s-1", userId: "u-1", revokedAt: null });
  const clock = { now: () => ALERTED_AT };
  const redeem = (overrides: Partial<Parameters<typeof redeemRecoveryToken>[1]> = {}) =>
    redeemRecoveryToken(
      { store, clock },
      {
        tokenId: "token-1",
        userId: "u-1",
        passkey: PASSKEY,
        redeemedAt: REDEEMED_AT,
        ...overrides,
      },
    );
  return { store, redeem };
}

describe("redeemRecoveryToken", () => {
  it("burns the token at the redemption time and answers the recovered user", async () => {
    const { store, redeem } = fixture();

    const outcome = await redeem();

    expect(outcome).toEqual({ kind: "redeemed", userId: "u-1" });
    expect(store.snapshot().tokens[0]?.usedAt).toEqual(REDEEMED_AT);
  });

  it("registers the passkey for the user", async () => {
    const { store, redeem } = fixture();

    await redeem();

    expect(store.snapshot().passkeys).toEqual([{ ...PASSKEY, id: "passkey-1", userId: "u-1" }]);
  });

  it("records that the token was redeemed and that the passkey was registered", async () => {
    const { store, redeem } = fixture();

    await redeem();

    const state = store.snapshot();
    expect(state.redeemedTokenRecords).toEqual([
      { tokenId: "token-1", userId: "u-1", at: REDEEMED_AT },
    ]);
    expect(state.passkeyRecords).toEqual([
      { userId: "u-1", passkeyId: "passkey-1", name: "Laptop" },
    ]);
  });

  it("opens an alert that a passkey was registered through recovery, dated when it is opened", async () => {
    const { store, redeem } = fixture();

    await redeem();

    expect(store.snapshot().alerts).toEqual([
      { userId: "u-1", passkeyName: "Laptop", openedAt: ALERTED_AT },
    ]);
  });

  it("locks the token, burns it, registers, records, alerts and revokes the sessions, in that order", async () => {
    const { store, redeem } = fixture();

    await redeem();

    expect(store.operationOrder).toEqual([
      "lockToken",
      "markTokenUsed",
      "registerPasskey",
      "recordTokenRedeemed",
      "recordPasskeyRegistered",
      "openPasskeyRegisteredAlert",
      "revokeSessions",
    ]);
  });

  it("revokes only the live sessions of the recovered user", async () => {
    const { store, redeem } = fixture();
    const earlier = new Date("2026-09-30T12:00:00.000Z");
    store.seedSession({ id: "s-2", userId: "u-1", revokedAt: earlier });
    store.seedSession({ id: "s-3", userId: "u-2", revokedAt: null });

    await redeem();

    expect(store.snapshot().sessions).toEqual([
      { id: "s-1", userId: "u-1", revokedAt: REDEEMED_AT },
      { id: "s-2", userId: "u-1", revokedAt: earlier },
      { id: "s-3", userId: "u-2", revokedAt: null },
    ]);
  });

  it.each([
    ["already used", { usedAt: new Date("2026-10-01T11:00:00.000Z") }],
    ["voided", { voidedAt: new Date("2026-10-01T11:00:00.000Z") }],
    ["past its expiry", { expiresAt: new Date(REDEEMED_AT.getTime() - 1) }],
    ["exactly at its expiry", { expiresAt: REDEEMED_AT }],
  ] as const)(
    "finds a token that is %s not redeemable and registers nothing",
    async (_name, overrides) => {
      const { store, redeem } = fixture(overrides);
      const before = store.snapshot();

      const outcome = await redeem();

      expect(outcome).toEqual({ kind: "not_redeemable" });
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("finds a token that no longer exists not redeemable", async () => {
    const { redeem } = fixture(null);

    expect(await redeem()).toEqual({ kind: "not_redeemable" });
  });

  it("does all its storage work in one transaction", async () => {
    const { store, redeem } = fixture();

    await redeem();

    expect(store.transactionCount).toBe(1);
  });

  describe("when another passkey already holds the credential", () => {
    function conflicting() {
      const { store, redeem } = fixture();
      store.seedPasskey({ ...PASSKEY, id: "passkey-held", userId: "u-2" });
      return { store, redeem };
    }

    it("refuses the passkey and leaves the token unburned so the link stays usable", async () => {
      const { store, redeem } = conflicting();

      const outcome = await redeem();

      expect(outcome).toEqual({ kind: "passkey_already_registered" });
      expect(store.snapshot().tokens[0]?.usedAt).toBeNull();
    });

    it("keeps the sessions, the records and the alerts untouched", async () => {
      const { store, redeem } = conflicting();
      const before = store.snapshot();

      await redeem();

      expect(store.snapshot()).toEqual(before);
    });
  });

  it.each([
    "markTokenUsed",
    "registerPasskey",
    "recordTokenRedeemed",
    "recordPasskeyRegistered",
    "openPasskeyRegisteredAlert",
    "revokeSessions",
  ] as const)("rolls everything back, burn included, when %s fails", async (operation) => {
    const { store, redeem } = fixture();
    store.failingWrites.add(operation);
    const before = store.snapshot();

    await expect(redeem()).rejects.toThrow(`${operation} failed`);

    expect(store.snapshot()).toEqual(before);
  });
});
