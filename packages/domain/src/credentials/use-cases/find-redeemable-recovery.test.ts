import { describe, expect, it } from "vitest";
import { findRedeemableRecovery } from "./find-redeemable-recovery.js";
import {
  FakeRecoveryRedemptionStore,
  type FakeRecoveryToken,
} from "./test-support/fake-recovery-redemption-store.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const TOKEN_HASH = "hash-1";

function storedToken(overrides: Partial<FakeRecoveryToken> = {}): FakeRecoveryToken {
  return {
    id: "token-1",
    tokenHash: TOKEN_HASH,
    userId: "u-1",
    expiresAt: new Date(NOW.getTime() + 60_000),
    usedAt: null,
    voidedAt: null,
    registrationChallenge: null,
    ...overrides,
  };
}

function fixture(token: FakeRecoveryToken | undefined, account = { active: true }) {
  const store = new FakeRecoveryRedemptionStore();
  if (token) {
    store.seedToken(token);
  }
  store.seedAccount({ id: "u-1", firstName: "Ada", email: "ada@example.test", ...account });
  const find = (tokenHash = TOKEN_HASH) =>
    findRedeemableRecovery({ store }, { tokenHash, now: NOW });
  return { store, find };
}

describe("findRedeemableRecovery", () => {
  it("rejects an unknown token as invalid, with no token to attribute the attempt to", async () => {
    const { find } = fixture(storedToken());

    expect(await find("unknown-hash")).toEqual({ kind: "rejected", reason: "invalid" });
  });

  it("rejects a used token as burned and returns it", async () => {
    const { find } = fixture(storedToken({ usedAt: NOW }));

    expect(await find()).toMatchObject({
      kind: "rejected",
      reason: "burned",
      token: { id: "token-1", userId: "u-1" },
    });
  });

  it("rejects a voided token as burned", async () => {
    const { find } = fixture(storedToken({ voidedAt: NOW }));

    expect(await find()).toMatchObject({ kind: "rejected", reason: "burned" });
  });

  it("rejects a token past its expiry as expired and returns it", async () => {
    const { find } = fixture(storedToken({ expiresAt: new Date(NOW.getTime() - 1) }));

    expect(await find()).toMatchObject({
      kind: "rejected",
      reason: "expired",
      token: { id: "token-1" },
    });
  });

  it("rejects a token exactly at its expiry as expired", async () => {
    const { find } = fixture(storedToken({ expiresAt: NOW }));

    expect(await find()).toMatchObject({ kind: "rejected", reason: "expired" });
  });

  it("rejects a used token that has also expired as burned", async () => {
    const { find } = fixture(storedToken({ usedAt: NOW, expiresAt: new Date(NOW.getTime() - 1) }));

    expect(await find()).toMatchObject({ kind: "rejected", reason: "burned" });
  });

  it("rejects a token whose account is gone as invalid, with no token to attribute", async () => {
    const { find } = fixture(storedToken({ userId: "u-missing" }));

    expect(await find()).toEqual({ kind: "rejected", reason: "invalid" });
  });

  it("rejects a live token of a deactivated account as invalid, returning the token", async () => {
    const { find } = fixture(storedToken(), { active: false });

    expect(await find()).toMatchObject({
      kind: "rejected",
      reason: "invalid",
      token: { id: "token-1", userId: "u-1" },
    });
  });

  it("answers the token, the account and its registered credentials for a live token", async () => {
    const { store, find } = fixture(storedToken({ registrationChallenge: "challenge-1" }));
    const passkey = {
      userId: "u-1",
      publicKey: "key",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      name: "Phone",
    };
    store.seedPasskey({ ...passkey, id: "p-1", credentialId: "cred-1", transports: ["usb"] });
    store.seedPasskey({ ...passkey, id: "p-2", credentialId: "cred-2", transports: null });
    store.seedPasskey({
      ...passkey,
      id: "p-3",
      userId: "u-2",
      credentialId: "cred-3",
      transports: null,
    });

    expect(await find()).toEqual({
      kind: "redeemable",
      token: {
        id: "token-1",
        userId: "u-1",
        expiresAt: new Date(NOW.getTime() + 60_000),
        usedAt: null,
        voidedAt: null,
        registrationChallenge: "challenge-1",
      },
      account: { id: "u-1", firstName: "Ada", email: "ada@example.test", active: true },
      credentials: [
        { credentialId: "cred-1", transports: ["usb"] },
        { credentialId: "cred-2", transports: null },
      ],
    });
  });

  it("writes nothing", async () => {
    const { store, find } = fixture(storedToken());
    const before = store.snapshot();

    await find();

    expect(store.snapshot()).toEqual(before);
  });
});
