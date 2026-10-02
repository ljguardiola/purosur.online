import { describe, expect, it } from "vitest";
import { removeUserPasskey } from "./remove-user-passkey.js";
import { FakePasskeyRemovalStore } from "./test-support/fake-passkey-removal-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const AUTHORIZED_AT = new Date("2026-10-01T11:58:00.000Z");
const INPUT = {
  administratorId: "admin-1",
  targetUserId: "u-1",
  passkeyId: "p-1",
  passkeyAuthorizedAt: AUTHORIZED_AT,
  at: AT,
};

function storeWithPasskey() {
  const store = new FakePasskeyRemovalStore();
  store.seedPasskey({ id: "p-1", userId: "u-1", name: "Llave" });
  store.seedSession({ id: "s-1", userId: "u-1", revokedAt: null });
  store.seedSession({ id: "s-2", userId: "u-2", revokedAt: null });
  return store;
}

describe("removeUserPasskey", () => {
  it("removes the passkey, ends every session of its user, audits it and tells the user", async () => {
    const store = storeWithPasskey();

    const outcome = await removeUserPasskey({ store }, INPUT);

    expect(outcome).toEqual({ kind: "removed" });
    expect(store.current.passkeys).toEqual([]);
    expect(store.current.sessions).toEqual([
      { id: "s-1", userId: "u-1", revokedAt: AT },
      { id: "s-2", userId: "u-2", revokedAt: null },
    ]);
    expect(store.current.audits).toEqual([
      { actorId: "admin-1", userId: "u-1", passkey: { id: "p-1", name: "Llave" } },
    ]);
    expect(store.current.alerts).toEqual([
      {
        userId: "u-1",
        passkeyName: "Llave",
        actorId: "admin-1",
        via: "administrator",
        openedAt: AT,
      },
    ]);
  });

  it("takes the passkey's lock before touching anything else", async () => {
    const store = storeWithPasskey();

    await removeUserPasskey({ store }, INPUT);

    expect(store.operationOrder).toEqual([
      "findRemovablePasskey",
      "deletePasskey",
      "revokeSessions",
      "recordUserPasskeyRemoved",
      "openPasskeyRemovedAlert",
    ]);
  });

  it("finds no passkey of another user and does nothing else", async () => {
    const store = storeWithPasskey();
    const before = store.snapshot();

    const outcome = await removeUserPasskey({ store }, { ...INPUT, targetUserId: "u-2" });

    expect(outcome).toEqual({ kind: "passkey_not_found" });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual(["findRemovablePasskey"]);
  });

  it.each([
    ["never authorized", null],
    ["authorized more than five minutes ago", new Date("2026-10-01T11:54:59.999Z")],
  ])(
    "requires an authorization and changes nothing when the session was %s",
    async (_name, passkeyAuthorizedAt) => {
      const store = storeWithPasskey();
      const before = store.snapshot();

      const outcome = await removeUserPasskey({ store }, { ...INPUT, passkeyAuthorizedAt });

      expect(outcome).toEqual({ kind: "authorization_required" });
      expect(store.current).toEqual(before);
      expect(store.operationOrder).toEqual([]);
    },
  );

  it("requires an authorization before looking for the passkey, even one that does not exist", async () => {
    const store = storeWithPasskey();

    const outcome = await removeUserPasskey(
      { store },
      { ...INPUT, passkeyId: "p-9", passkeyAuthorizedAt: null },
    );

    expect(outcome).toEqual({ kind: "authorization_required" });
    expect(store.operationOrder).toEqual([]);
  });

  it.each([
    "deletePasskey",
    "revokeSessions",
    "recordUserPasskeyRemoved",
    "openPasskeyRemovedAlert",
  ] as const)("leaves the passkey and the sessions untouched when %s fails", async (failing) => {
    const store = storeWithPasskey();
    const before = store.snapshot();
    store.failingWrites.add(failing);

    await expect(removeUserPasskey({ store }, INPUT)).rejects.toThrow(`${failing} failed`);

    expect(store.current).toEqual(before);
  });
});
