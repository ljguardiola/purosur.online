import { describe, expect, it } from "vitest";
import { deactivateUser } from "./deactivate-user.js";
import { administrator, user } from "./test-support/branch-user-fixtures.js";
import { FakeUserStore } from "./test-support/fake-user-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");

function fixture(...seeded: Parameters<FakeUserStore["seedUser"]>[0][]) {
  const store = new FakeUserStore();
  store.seedRole({
    id: "role-cashier",
    name: "Cajero",
    isAdministrator: false,
    permissionKeys: [],
  });
  store.seedRole({ id: "role-admin", name: null, isAdministrator: true, permissionKeys: [] });
  for (const seed of seeded) {
    store.seedUser(seed);
  }
  const deactivate = (id = "u-1", actorId = "u-actor") =>
    deactivateUser({ store }, { id, actorId, at: AT });
  return { store, deactivate };
}

describe("deactivateUser", () => {
  it("deactivates the user and bumps their version", async () => {
    const { store, deactivate } = fixture(user({ id: "u-1", version: 4 }));

    const outcome = await deactivate();

    expect(outcome).toEqual({ kind: "deactivated" });
    expect(store.snapshot().users[0]).toMatchObject({ id: "u-1", active: false, version: 5 });
  });

  it("revokes the user's sessions at the moment of deactivation", async () => {
    const { store, deactivate } = fixture(user({ id: "u-1" }));

    await deactivate();

    expect(store.snapshot().revokedSessions).toEqual([{ userId: "u-1", at: AT }]);
  });

  it("records who deactivated the user", async () => {
    const { store, deactivate } = fixture(user({ id: "u-1" }));

    await deactivate();

    expect(store.snapshot().changes).toEqual([
      { userId: "u-1", actorId: "u-actor", change: { kind: "deactivated" } },
    ]);
  });

  it("answers not found for a user that does not exist", async () => {
    const { store, deactivate } = fixture();

    expect(await deactivate("u-missing")).toEqual({ kind: "not_found" });
    expect(store.snapshot().revokedSessions).toEqual([]);
  });

  it("answers not found for a user that is already deactivated, and writes nothing", async () => {
    const { store, deactivate } = fixture(user({ id: "u-1", active: false, version: 2 }));

    expect(await deactivate()).toEqual({ kind: "not_found" });
    const after = store.snapshot();
    expect(after.users[0]).toMatchObject({ version: 2 });
    expect(after.changes).toEqual([]);
    expect(after.revokedSessions).toEqual([]);
  });

  it("answers not found for an administrator, such as a user promoted after they were found", async () => {
    const { store, deactivate } = fixture(administrator({ id: "u-1" }));

    expect(await deactivate()).toEqual({ kind: "not_found" });
    expect(store.snapshot().users[0]).toMatchObject({ active: true, version: 1 });
    expect(store.snapshot().revokedSessions).toEqual([]);
  });

  it("answers not found when the actor deactivates themself", async () => {
    const { store, deactivate } = fixture(user({ id: "u-actor" }));

    expect(await deactivate("u-actor")).toEqual({ kind: "not_found" });
    expect(store.snapshot().users[0]).toMatchObject({ active: true });
  });

  it("locks the user, checks their role, then writes the user, the sessions and the audit", async () => {
    const { store, deactivate } = fixture(user({ id: "u-1" }));

    await deactivate();

    expect(store.operationOrder).toEqual([
      "lockUserForDeactivation",
      "roleOfUser",
      "rewriteUser",
      "revokeSessions",
      "recordUserChange",
    ]);
  });

  it.each(["rewriteUser", "revokeSessions", "recordUserChange"] as const)(
    "leaves the user active with their sessions when %s fails",
    async (operation) => {
      const { store, deactivate } = fixture(user({ id: "u-1", version: 4 }));
      store.failingWrites.add(operation);

      await expect(deactivate()).rejects.toThrow(`${operation} failed`);

      const after = store.snapshot();
      expect(after.users[0]).toMatchObject({ active: true, version: 4 });
      expect(after.revokedSessions).toEqual([]);
      expect(after.changes).toEqual([]);
    },
  );
});
