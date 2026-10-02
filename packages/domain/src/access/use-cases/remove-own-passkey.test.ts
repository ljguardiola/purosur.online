import { describe, expect, it } from "vitest";
import { removeOwnPasskey } from "./remove-own-passkey.js";
import { FakePasskeyRemovalStore } from "./test-support/fake-passkey-removal-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const AUTHORIZED_AT = new Date("2026-10-01T11:58:00.000Z");
const INPUT = { userId: "u-1", passkeyId: "p-1", passkeyAuthorizedAt: AUTHORIZED_AT, at: AT };

function storeWithPasskey() {
  const store = new FakePasskeyRemovalStore();
  store.seedPasskey({ id: "p-1", userId: "u-1", name: "Llave" });
  store.seedSession({ id: "s-1", userId: "u-1", revokedAt: null });
  return store;
}

describe("removeOwnPasskey", () => {
  it("removes the passkey, audits it and tells the user, leaving their sessions open", async () => {
    const store = storeWithPasskey();

    const outcome = await removeOwnPasskey({ store }, INPUT);

    expect(outcome).toEqual({ kind: "removed" });
    expect(store.current.passkeys).toEqual([]);
    expect(store.current.audits).toEqual([
      { actorId: "u-1", userId: null, passkey: { id: "p-1", name: "Llave" } },
    ]);
    expect(store.current.alerts).toEqual([
      { userId: "u-1", passkeyName: "Llave", actorId: "u-1", via: "self", openedAt: AT },
    ]);
    expect(store.current.sessions).toEqual([{ id: "s-1", userId: "u-1", revokedAt: null }]);
    expect(store.operationOrder).toEqual([
      "findRemovablePasskey",
      "deletePasskey",
      "recordOwnPasskeyRemoved",
      "openPasskeyRemovedAlert",
    ]);
  });

  it("finds no passkey of another user and changes nothing", async () => {
    const store = storeWithPasskey();
    const before = store.snapshot();

    const outcome = await removeOwnPasskey({ store }, { ...INPUT, userId: "u-2" });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual(["findRemovablePasskey"]);
  });

  it.each([
    ["never authorized", null],
    ["authorized more than five minutes ago", new Date("2026-10-01T11:54:59.999Z")],
  ])(
    "requires an authorization and changes nothing when the session was %s",
    async (_name, authorizedAt) => {
      const store = storeWithPasskey();
      const before = store.snapshot();

      const outcome = await removeOwnPasskey(
        { store },
        { ...INPUT, passkeyAuthorizedAt: authorizedAt },
      );

      expect(outcome).toEqual({ kind: "authorization_required" });
      expect(store.current).toEqual(before);
      expect(store.operationOrder).toEqual([]);
    },
  );

  it("requires an authorization before looking for the passkey, even one that does not exist", async () => {
    const store = storeWithPasskey();

    const outcome = await removeOwnPasskey(
      { store },
      { ...INPUT, passkeyId: "p-9", passkeyAuthorizedAt: null },
    );

    expect(outcome).toEqual({ kind: "authorization_required" });
    expect(store.operationOrder).toEqual([]);
  });

  it.each(["deletePasskey", "recordOwnPasskeyRemoved", "openPasskeyRemovedAlert"] as const)(
    "keeps the passkey when %s fails",
    async (failing) => {
      const store = storeWithPasskey();
      const before = store.snapshot();
      store.failingWrites.add(failing);

      await expect(removeOwnPasskey({ store }, INPUT)).rejects.toThrow(`${failing} failed`);

      expect(store.current).toEqual(before);
    },
  );
});
