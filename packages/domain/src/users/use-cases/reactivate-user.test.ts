import { describe, expect, it } from "vitest";
import { reactivateUser } from "./reactivate-user.js";
import { user } from "./test-support/branch-user-fixtures.js";
import { FakeUserStore } from "./test-support/fake-user-store.js";

function fixture(...seeded: Parameters<FakeUserStore["seedUser"]>[0][]) {
  const store = new FakeUserStore();
  for (const seed of seeded) {
    store.seedUser(seed);
  }
  const reactivate = (id = "u-1") => reactivateUser({ store }, { id, actorId: "u-actor" });
  return { store, reactivate };
}

describe("reactivateUser", () => {
  it("reactivates a deactivated user and bumps their version", async () => {
    const { store, reactivate } = fixture(user({ id: "u-1", active: false, version: 4 }));

    const outcome = await reactivate();

    expect(outcome).toEqual({ kind: "reactivated" });
    expect(store.snapshot().users[0]).toMatchObject({ active: true, version: 5 });
  });

  it("records who reactivated the user", async () => {
    const { store, reactivate } = fixture(user({ id: "u-1", active: false }));

    await reactivate();

    expect(store.snapshot().changes).toEqual([
      { userId: "u-1", actorId: "u-actor", change: { kind: "reactivated" } },
    ]);
  });

  it("answers not found for a user that does not exist", async () => {
    const { reactivate } = fixture();

    expect(await reactivate("u-missing")).toEqual({ kind: "not_found" });
  });

  it("answers not found for an active user, and records nothing", async () => {
    const { store, reactivate } = fixture(user({ id: "u-1", active: true, version: 2 }));

    expect(await reactivate()).toEqual({ kind: "not_found" });
    expect(store.snapshot().users[0]).toMatchObject({ version: 2 });
    expect(store.snapshot().changes).toEqual([]);
  });

  it("locks the user before writing it and recording the change", async () => {
    const { store, reactivate } = fixture(user({ id: "u-1", active: false }));

    await reactivate();

    expect(store.operationOrder).toEqual(["lockUser", "rewriteUser", "recordUserChange"]);
  });

  it.each(["rewriteUser", "recordUserChange"] as const)(
    "leaves the user deactivated when %s fails",
    async (operation) => {
      const { store, reactivate } = fixture(user({ id: "u-1", active: false, version: 4 }));
      store.failingWrites.add(operation);

      await expect(reactivate()).rejects.toThrow(`${operation} failed`);

      expect(store.snapshot().users[0]).toMatchObject({ active: false, version: 4 });
      expect(store.snapshot().changes).toEqual([]);
    },
  );
});
