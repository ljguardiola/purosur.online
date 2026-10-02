import { describe, expect, it } from "vitest";
import { removeOwnPasskey } from "./remove-own-passkey.js";
import { FakePasskeyRemovalStore } from "./test-support/fake-passkey-removal-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");

function storeWithPasskey() {
  const store = new FakePasskeyRemovalStore();
  store.seedPasskey({ id: "p-1", userId: "u-1", name: "Llave" });
  store.seedSession({ id: "s-1", userId: "u-1", revokedAt: null });
  return store;
}

describe("removeOwnPasskey", () => {
  it("removes the passkey, audits it and tells the user, leaving their sessions open", async () => {
    const store = storeWithPasskey();

    const outcome = await removeOwnPasskey({ store }, { userId: "u-1", passkeyId: "p-1", at: AT });

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
      "deletePasskey",
      "recordOwnPasskeyRemoved",
      "openPasskeyRemovedAlert",
    ]);
  });

  it("finds no passkey of another user and changes nothing", async () => {
    const store = storeWithPasskey();
    const before = store.snapshot();

    const outcome = await removeOwnPasskey({ store }, { userId: "u-2", passkeyId: "p-1", at: AT });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual(["deletePasskey"]);
  });

  it.each(["recordOwnPasskeyRemoved", "openPasskeyRemovedAlert"] as const)(
    "keeps the passkey when %s fails",
    async (failing) => {
      const store = storeWithPasskey();
      const before = store.snapshot();
      store.failingWrites.add(failing);

      await expect(
        removeOwnPasskey({ store }, { userId: "u-1", passkeyId: "p-1", at: AT }),
      ).rejects.toThrow(`${failing} failed`);

      expect(store.current).toEqual(before);
    },
  );
});
