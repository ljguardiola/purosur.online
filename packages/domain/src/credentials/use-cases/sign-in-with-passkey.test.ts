import { describe, expect, it } from "vitest";
import { signInWithPasskey } from "./sign-in-with-passkey.js";
import { FakeAccounts } from "./test-support/fake-accounts.js";
import { FakePasskeyAssertionVerifier } from "./test-support/fake-passkey-assertion-verifier.js";
import { FakePasskeySignInStore } from "./test-support/fake-passkey-sign-in-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const EARLIER = new Date("2026-10-01T08:00:00.000Z");
const INPUT = {
  credentialId: "credential-1",
  attemptId: "attempt-1",
  sessionKey: "new-key",
  at: AT,
};
const STORED_PASSKEY = {
  id: "p-1",
  userId: "u-1",
  credentialId: "credential-1",
  publicKey: "public-key",
  counter: 4,
  transports: ["internal"],
};

function setup(
  options: {
    userActive?: boolean;
    verification?: { verified: true; newCounter: number } | { verified: false };
    seedPasskey?: boolean;
  } = {},
) {
  const accounts = new FakeAccounts();
  accounts.seedPasskey({ ...STORED_PASSKEY, userActive: options.userActive ?? true });
  const verifier = new FakePasskeyAssertionVerifier(
    options.verification ?? { verified: true, newCounter: 5 },
  );
  const store = new FakePasskeySignInStore();
  if (options.seedPasskey ?? true) {
    store.seedPasskey({ id: "p-1", counter: 4, lastUsedAt: null });
  }
  store.seedSignInAttempt("attempt-1");
  store.seedSignInAttempt("attempt-2");
  return { accounts, verifier, store };
}

describe("signInWithPasskey", () => {
  it("opens a session authorized at that moment, records the passkey use and discards the attempt", async () => {
    const ports = setup();

    const outcome = await signInWithPasskey(ports, INPUT);

    expect(outcome).toEqual({ kind: "signed_in" });
    expect(ports.store.current).toEqual({
      passkeys: [{ id: "p-1", counter: 5, lastUsedAt: AT }],
      sessions: [
        {
          userId: "u-1",
          sessionKey: "new-key",
          createdAt: AT,
          lastSeenAt: AT,
          passkeyAuthorizedAt: AT,
          revokedAt: null,
        },
      ],
      signInAttempts: ["attempt-2"],
    });
  });

  it("verifies the stored passkey's key material and nothing else", async () => {
    const ports = setup();

    await signInWithPasskey(ports, INPUT);

    expect(ports.verifier.verifiedPasskeys).toEqual([
      {
        credentialId: "credential-1",
        publicKey: "public-key",
        counter: 4,
        transports: ["internal"],
      },
    ]);
  });

  it("ends the session the request arrived with", async () => {
    const ports = setup();
    ports.store.seedSession({
      userId: "u-1",
      sessionKey: "old-key",
      createdAt: EARLIER,
      lastSeenAt: EARLIER,
      passkeyAuthorizedAt: EARLIER,
      revokedAt: null,
    });

    await signInWithPasskey(ports, { ...INPUT, previousSessionKey: "old-key" });

    expect(ports.store.current.sessions.map((s) => [s.sessionKey, s.revokedAt])).toEqual([
      ["old-key", AT],
      ["new-key", null],
    ]);
  });

  it("takes the passkey's lock before any session exists, then ends, opens and discards in one transaction", async () => {
    const ports = setup();

    await signInWithPasskey(ports, { ...INPUT, previousSessionKey: "old-key" });

    expect(ports.store.operationOrder).toEqual([
      "recordPasskeyUse",
      "endSession",
      "openSession",
      "discardSignInAttempt",
    ]);
    expect(ports.store.transactions).toBe(1);
  });

  it("ends no session when the request arrived with none", async () => {
    const ports = setup();

    await signInWithPasskey(ports, INPUT);

    expect(ports.store.operationOrder).toEqual([
      "recordPasskeyUse",
      "openSession",
      "discardSignInAttempt",
    ]);
  });

  it("refuses a passkey it never saved without verifying or writing", async () => {
    const ports = setup();
    const before = ports.store.snapshot();

    const outcome = await signInWithPasskey(ports, { ...INPUT, credentialId: "other" });

    expect(outcome).toEqual({ kind: "unknown_passkey" });
    expect(ports.verifier.verifiedPasskeys).toEqual([]);
    expect(ports.store.transactions).toBe(0);
    expect(ports.store.current).toEqual(before);
  });

  it("refuses the passkey of a deactivated account without verifying or writing", async () => {
    const ports = setup({ userActive: false });
    const before = ports.store.snapshot();

    const outcome = await signInWithPasskey(ports, INPUT);

    expect(outcome).toEqual({ kind: "inactive" });
    expect(ports.verifier.verifiedPasskeys).toEqual([]);
    expect(ports.store.transactions).toBe(0);
    expect(ports.store.current).toEqual(before);
  });

  it("refuses an assertion that does not verify without writing", async () => {
    const ports = setup({ verification: { verified: false } });
    const before = ports.store.snapshot();

    const outcome = await signInWithPasskey(ports, INPUT);

    expect(outcome).toEqual({ kind: "not_verified" });
    expect(ports.store.transactions).toBe(0);
    expect(ports.store.current).toEqual(before);
  });

  it("refuses a counter that did not increase as a clone signal without writing", async () => {
    const ports = setup({ verification: { verified: true, newCounter: 4 } });
    const before = ports.store.snapshot();

    const outcome = await signInWithPasskey(ports, INPUT);

    expect(outcome).toEqual({ kind: "clone_signal" });
    expect(ports.store.transactions).toBe(0);
    expect(ports.store.current).toEqual(before);
  });

  it("opens no session and ends none when the passkey was removed in the meantime", async () => {
    const ports = setup({ seedPasskey: false });
    ports.store.seedSession({
      userId: "u-1",
      sessionKey: "old-key",
      createdAt: EARLIER,
      lastSeenAt: EARLIER,
      passkeyAuthorizedAt: EARLIER,
      revokedAt: null,
    });
    const before = ports.store.snapshot();

    const outcome = await signInWithPasskey(ports, { ...INPUT, previousSessionKey: "old-key" });

    expect(outcome).toEqual({ kind: "passkey_removed" });
    expect(ports.store.operationOrder).toEqual(["recordPasskeyUse"]);
    expect(ports.store.current).toEqual(before);
  });

  it.each(["recordPasskeyUse", "endSession", "openSession", "discardSignInAttempt"] as const)(
    "leaves nothing behind when %s fails",
    async (failing) => {
      const ports = setup();
      ports.store.seedSession({
        userId: "u-1",
        sessionKey: "old-key",
        createdAt: EARLIER,
        lastSeenAt: EARLIER,
        passkeyAuthorizedAt: EARLIER,
        revokedAt: null,
      });
      const before = ports.store.snapshot();
      ports.store.failingWrites.add(failing);

      await expect(
        signInWithPasskey(ports, { ...INPUT, previousSessionKey: "old-key" }),
      ).rejects.toThrow(`${failing} failed`);

      expect(ports.store.current).toEqual(before);
    },
  );
});
