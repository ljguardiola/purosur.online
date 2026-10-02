import { describe, expect, it } from "vitest";
import { authorizeSession } from "./authorize-session.js";
import { FakePasskeyAssertionVerifier } from "./test-support/fake-passkey-assertion-verifier.js";
import { FakePasskeys } from "./test-support/fake-passkeys.js";
import { FakeSessionAuthorizationStore } from "./test-support/fake-session-authorization-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const INPUT = { userId: "u-1", sessionId: "s-1", credentialId: "credential-1", at: AT };

function setup(
  options: {
    verification?: { verified: true; newCounter: number } | { verified: false };
    seedPasskeyRow?: boolean;
  } = {},
) {
  const passkeys = new FakePasskeys();
  passkeys.seedStoredPasskey({
    id: "p-1",
    userId: "u-1",
    credentialId: "credential-1",
    publicKey: "public-key",
    counter: 4,
    transports: ["internal"],
  });
  const verifier = new FakePasskeyAssertionVerifier(
    options.verification ?? { verified: true, newCounter: 5 },
  );
  const store = new FakeSessionAuthorizationStore();
  if (options.seedPasskeyRow ?? true) {
    store.seedPasskey({ id: "p-1", counter: 4, lastUsedAt: null });
  }
  store.seedSession({ id: "s-1", passkeyAuthorizedAt: null });
  store.seedSession({ id: "s-2", passkeyAuthorizedAt: null });
  return { passkeys, verifier, store };
}

describe("authorizeSession", () => {
  it("authorizes the session at that moment and records the passkey use", async () => {
    const ports = setup();

    const outcome = await authorizeSession(ports, INPUT);

    expect(outcome).toEqual({ kind: "authorized" });
    expect(ports.store.current).toEqual({
      passkeys: [{ id: "p-1", counter: 5, lastUsedAt: AT }],
      sessions: [
        { id: "s-1", passkeyAuthorizedAt: AT },
        { id: "s-2", passkeyAuthorizedAt: null },
      ],
    });
  });

  it("verifies the stored passkey's key material and nothing else", async () => {
    const ports = setup();

    await authorizeSession(ports, INPUT);

    expect(ports.verifier.verifiedPasskeys).toEqual([
      {
        credentialId: "credential-1",
        publicKey: "public-key",
        counter: 4,
        transports: ["internal"],
      },
    ]);
  });

  it("records the use and authorizes the session in one transaction", async () => {
    const ports = setup();

    await authorizeSession(ports, INPUT);

    expect(ports.store.operationOrder).toEqual(["recordPasskeyUse", "authorizeSession"]);
    expect(ports.store.transactions).toBe(1);
  });

  it("never accepts another account's passkey with a matching credential id", async () => {
    const ports = setup();
    const before = ports.store.snapshot();

    const outcome = await authorizeSession(ports, { ...INPUT, userId: "u-2" });

    expect(outcome).toEqual({ kind: "not_verified" });
    expect(ports.verifier.verifiedPasskeys).toEqual([]);
    expect(ports.store.transactions).toBe(0);
    expect(ports.store.current).toEqual(before);
  });

  it("refuses a credential the account never registered", async () => {
    const ports = setup();

    const outcome = await authorizeSession(ports, { ...INPUT, credentialId: "other" });

    expect(outcome).toEqual({ kind: "not_verified" });
    expect(ports.verifier.verifiedPasskeys).toEqual([]);
  });

  it("refuses an assertion that does not verify without writing", async () => {
    const ports = setup({ verification: { verified: false } });
    const before = ports.store.snapshot();

    const outcome = await authorizeSession(ports, INPUT);

    expect(outcome).toEqual({ kind: "not_verified" });
    expect(ports.store.transactions).toBe(0);
    expect(ports.store.current).toEqual(before);
  });

  it("refuses a counter that did not increase as a clone signal without writing", async () => {
    const ports = setup({ verification: { verified: true, newCounter: 4 } });
    const before = ports.store.snapshot();

    const outcome = await authorizeSession(ports, INPUT);

    expect(outcome).toEqual({ kind: "clone_signal" });
    expect(ports.store.transactions).toBe(0);
    expect(ports.store.current).toEqual(before);
  });

  it("still authorizes the session when the passkey was removed in the meantime", async () => {
    const ports = setup({ seedPasskeyRow: false });

    const outcome = await authorizeSession(ports, INPUT);

    expect(outcome).toEqual({ kind: "authorized" });
    expect(ports.store.operationOrder).toEqual(["recordPasskeyUse", "authorizeSession"]);
    expect(ports.store.current).toEqual({
      passkeys: [],
      sessions: [
        { id: "s-1", passkeyAuthorizedAt: AT },
        { id: "s-2", passkeyAuthorizedAt: null },
      ],
    });
  });

  it.each(["recordPasskeyUse", "authorizeSession"] as const)(
    "leaves nothing behind when %s fails",
    async (failing) => {
      const ports = setup();
      const before = ports.store.snapshot();
      ports.store.failingWrites.add(failing);

      await expect(authorizeSession(ports, INPUT)).rejects.toThrow(`${failing} failed`);

      expect(ports.store.current).toEqual(before);
    },
  );
});
