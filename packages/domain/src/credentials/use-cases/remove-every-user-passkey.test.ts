import { describe, expect, it, vi } from "vitest";
import {
  removeEveryUserPasskey,
  removeEveryUserPasskeyWithin,
} from "./remove-every-user-passkey.js";
import { FakePasskeyHolders } from "./test-support/fake-passkey-holders.js";
import { FakePasskeyRemovalStore } from "./test-support/fake-passkey-removal-store.js";

const BRANCH = "branch-1";
const AT = new Date("2026-10-01T12:00:00.000Z");
const AUTHORIZED_AT = new Date("2026-10-01T11:58:00.000Z");
const INPUT = {
  locationId: BRANCH,
  administratorId: "admin-1",
  targetUserId: "u-1",
  passkeyAuthorizedAt: AUTHORIZED_AT,
  at: AT,
};

function storeWithPasskeys() {
  const store = new FakePasskeyRemovalStore();
  store.seedPasskey({ id: "p-1", userId: "u-1", name: "Llave" });
  store.seedPasskey({ id: "p-2", userId: "u-1", name: "Teléfono" });
  store.seedPasskey({ id: "p-3", userId: "u-2", name: "Otra llave" });
  store.seedSession({ id: "s-1", userId: "u-1", revokedAt: null });
  store.seedSession({ id: "s-2", userId: "u-2", revokedAt: null });
  return store;
}

function holdersWithTarget() {
  const holders = new FakePasskeyHolders();
  for (const id of ["u-1", "u-2", "u-3", "admin-1"]) {
    holders.seedHolder({ id, locationId: BRANCH, active: true });
  }
  return holders;
}

describe("removeEveryUserPasskey", () => {
  it("removes every passkey of the chosen account and leaves the other accounts' passkeys", async () => {
    const store = storeWithPasskeys();

    const outcome = await removeEveryUserPasskey({ store, holders: holdersWithTarget() }, INPUT);

    expect(outcome).toEqual({ kind: "removed" });
    expect(store.current.passkeys).toEqual([{ id: "p-3", userId: "u-2", name: "Otra llave" }]);
  });

  it("ends every session of the chosen account and no other", async () => {
    const store = storeWithPasskeys();

    await removeEveryUserPasskey({ store, holders: holdersWithTarget() }, INPUT);

    expect(store.current.sessions).toEqual([
      { id: "s-1", userId: "u-1", revokedAt: AT },
      { id: "s-2", userId: "u-2", revokedAt: null },
    ]);
  });

  it("audits each removed passkey with the administrator's id and tells the user of each", async () => {
    const store = storeWithPasskeys();

    await removeEveryUserPasskey({ store, holders: holdersWithTarget() }, INPUT);

    expect(store.current.audits).toEqual([
      { actorId: "admin-1", userId: "u-1", passkey: { id: "p-1", name: "Llave" } },
      { actorId: "admin-1", userId: "u-1", passkey: { id: "p-2", name: "Teléfono" } },
    ]);
    expect(store.current.alerts).toEqual([
      {
        userId: "u-1",
        passkeyName: "Llave",
        actorId: "admin-1",
        via: "administrator",
        openedAt: AT,
      },
      {
        userId: "u-1",
        passkeyName: "Teléfono",
        actorId: "admin-1",
        via: "administrator",
        openedAt: AT,
      },
    ]);
  });

  it("locks the account's passkeys first and revokes its sessions once", async () => {
    const store = storeWithPasskeys();

    await removeEveryUserPasskey({ store, holders: holdersWithTarget() }, INPUT);

    expect(store.operationOrder).toEqual([
      "lockUserPasskeys",
      "deletePasskey",
      "deletePasskey",
      "revokeSessions",
      "recordUserPasskeyRemoved",
      "openPasskeyRemovedAlert",
      "recordUserPasskeyRemoved",
      "openPasskeyRemovedAlert",
    ]);
  });

  it("answers no_passkeys and changes nothing for an account without passkeys", async () => {
    const store = storeWithPasskeys();
    const before = store.snapshot();

    const outcome = await removeEveryUserPasskey(
      { store, holders: holdersWithTarget() },
      { ...INPUT, targetUserId: "u-3" },
    );

    expect(outcome).toEqual({ kind: "no_passkeys" });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual(["lockUserPasskeys"]);
  });

  it.each([
    ["never authorized", null],
    ["authorized more than five minutes ago", new Date("2026-10-01T11:54:59.999Z")],
  ])(
    "requires an authorization and looks nothing up when the session was %s",
    async (_name, passkeyAuthorizedAt) => {
      const store = storeWithPasskeys();
      const before = store.snapshot();

      const outcome = await removeEveryUserPasskey(
        { store, holders: holdersWithTarget() },
        { ...INPUT, passkeyAuthorizedAt },
      );

      expect(outcome).toEqual({ kind: "authorization_required" });
      expect(store.current).toEqual(before);
      expect(store.operationOrder).toEqual([]);
    },
  );

  it("looks the account up only after the authorization, even for one that does not exist", async () => {
    const store = storeWithPasskeys();
    const holders = holdersWithTarget();
    const passkeyHolder = vi.spyOn(holders, "passkeyHolder");

    const outcome = await removeEveryUserPasskey(
      { store, holders },
      { ...INPUT, targetUserId: "nobody", passkeyAuthorizedAt: null },
    );

    expect(outcome).toEqual({ kind: "authorization_required" });
    expect(passkeyHolder).not.toHaveBeenCalled();
    expect(store.operationOrder).toEqual([]);
  });

  it.each([
    ["a missing account", { targetUserId: "missing" }],
    ["an account of another branch", { locationId: "branch-2" }],
  ])("answers user_not_found for %s, changing nothing", async (_name, override) => {
    const store = storeWithPasskeys();
    const before = store.snapshot();

    const outcome = await removeEveryUserPasskey(
      { store, holders: holdersWithTarget() },
      { ...INPUT, ...override },
    );

    expect(outcome).toEqual({ kind: "user_not_found" });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual([]);
  });

  it("answers user_not_found for a deactivated account", async () => {
    const store = storeWithPasskeys();
    const holders = new FakePasskeyHolders();
    holders.seedHolder({ id: "u-1", locationId: BRANCH, active: false });

    const outcome = await removeEveryUserPasskey({ store, holders }, INPUT);

    expect(outcome).toEqual({ kind: "user_not_found" });
    expect(store.operationOrder).toEqual([]);
  });

  it("refuses the administrator's own account, changing nothing", async () => {
    const store = storeWithPasskeys();
    store.seedPasskey({ id: "p-9", userId: "admin-1", name: "Mía" });
    const before = store.snapshot();

    const outcome = await removeEveryUserPasskey(
      { store, holders: holdersWithTarget() },
      { ...INPUT, targetUserId: "admin-1" },
    );

    expect(outcome).toEqual({ kind: "own_account" });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual([]);
  });

  it.each([
    "deletePasskey",
    "revokeSessions",
    "recordUserPasskeyRemoved",
    "openPasskeyRemovedAlert",
  ] as const)("leaves everything in place when %s fails", async (operation) => {
    const store = storeWithPasskeys();
    const before = store.snapshot();
    store.failingWrites.add(operation);

    await expect(
      removeEveryUserPasskey({ store, holders: holdersWithTarget() }, INPUT),
    ).rejects.toThrow(`${operation} failed`);

    expect(store.current).toEqual(before);
  });
});

describe("removeEveryUserPasskeyWithin", () => {
  it("removes every passkey of the chosen account on the transaction it is given", async () => {
    const store = storeWithPasskeys();

    const outcome = await store.transaction((tx) =>
      removeEveryUserPasskeyWithin(tx, holdersWithTarget(), INPUT),
    );

    expect(outcome).toEqual({ kind: "removed" });
    expect(store.current.passkeys).toEqual([{ id: "p-3", userId: "u-2", name: "Otra llave" }]);
    expect(store.current.sessions).toEqual([
      { id: "s-1", userId: "u-1", revokedAt: AT },
      { id: "s-2", userId: "u-2", revokedAt: null },
    ]);
  });

  it.each([
    ["authorization_required", { passkeyAuthorizedAt: null }],
    ["user_not_found", { targetUserId: "missing" }],
    ["own_account", { targetUserId: "admin-1" }],
  ] as const)("refuses as %s without touching the transaction", async (kind, override) => {
    const store = storeWithPasskeys();

    const outcome = await store.transaction((tx) =>
      removeEveryUserPasskeyWithin(tx, holdersWithTarget(), { ...INPUT, ...override }),
    );

    expect(outcome).toEqual({ kind });
    expect(store.operationOrder).toEqual([]);
  });
});
