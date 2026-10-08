import { describe, expect, it, vi } from "vitest";
import { removeUserPasskey } from "./remove-user-passkey.js";
import { FakePasskeyHolders } from "./test-support/fake-passkey-holders.js";
import { FakePasskeyRemovalStore } from "./test-support/fake-passkey-removal-store.js";

const BRANCH = "branch-1";
const AT = new Date("2026-10-01T12:00:00.000Z");
const AUTHORIZED_AT = new Date("2026-10-01T11:58:00.000Z");
const INPUT = {
  locationId: BRANCH,
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

function holdersWithTarget() {
  const holders = new FakePasskeyHolders();
  for (const id of ["u-1", "u-2", "admin-1"]) {
    holders.seedHolder({ id, locationId: BRANCH, active: true });
  }
  return holders;
}

describe("removeUserPasskey", () => {
  it("removes the passkey, ends every session of its user, audits it and tells the user", async () => {
    const store = storeWithPasskey();

    const outcome = await removeUserPasskey({ store, holders: holdersWithTarget() }, INPUT);

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

    await removeUserPasskey({ store, holders: holdersWithTarget() }, INPUT);

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

    const outcome = await removeUserPasskey(
      { store, holders: holdersWithTarget() },
      { ...INPUT, targetUserId: "u-2" },
    );

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

      const outcome = await removeUserPasskey(
        { store, holders: holdersWithTarget() },
        { ...INPUT, passkeyAuthorizedAt },
      );

      expect(outcome).toEqual({ kind: "authorization_required" });
      expect(store.current).toEqual(before);
      expect(store.operationOrder).toEqual([]);
    },
  );

  it("requires an authorization before looking for the passkey, even one that does not exist", async () => {
    const store = storeWithPasskey();

    const outcome = await removeUserPasskey(
      { store, holders: holdersWithTarget() },
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

    await expect(removeUserPasskey({ store, holders: holdersWithTarget() }, INPUT)).rejects.toThrow(
      `${failing} failed`,
    );

    expect(store.current).toEqual(before);
  });

  it("reaches neither port when the session is not authorized, even for a target that does not exist", async () => {
    const store = storeWithPasskey();
    const holders = holdersWithTarget();
    const passkeyHolder = vi.spyOn(holders, "passkeyHolder");

    const outcome = await removeUserPasskey(
      { store, holders },
      { ...INPUT, targetUserId: "nobody", passkeyAuthorizedAt: null },
    );

    expect(outcome).toEqual({ kind: "authorization_required" });
    expect(passkeyHolder).not.toHaveBeenCalled();
    expect(store.operationOrder).toEqual([]);
  });

  it("refuses the administrator's own account before touching the passkey", async () => {
    const store = storeWithPasskey();
    const before = store.snapshot();

    const outcome = await removeUserPasskey(
      { store, holders: holdersWithTarget() },
      { ...INPUT, targetUserId: "admin-1" },
    );

    expect(outcome).toEqual({ kind: "own_account" });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual([]);
  });

  it("finds no user in another branch or among the deactivated, and touches nothing", async () => {
    const store = storeWithPasskey();
    const before = store.snapshot();
    const holders = new FakePasskeyHolders();
    holders.seedHolder({ id: "u-1", locationId: "branch-2", active: true });
    holders.seedHolder({ id: "u-2", locationId: BRANCH, active: false });

    expect(await removeUserPasskey({ store, holders }, INPUT)).toEqual({ kind: "user_not_found" });
    expect(await removeUserPasskey({ store, holders }, { ...INPUT, targetUserId: "u-2" })).toEqual({
      kind: "user_not_found",
    });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual([]);
  });
});
