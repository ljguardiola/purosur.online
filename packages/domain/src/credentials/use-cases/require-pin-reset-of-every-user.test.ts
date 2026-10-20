import { describe, expect, it } from "vitest";
import { requirePinResetOfEveryUser } from "./require-pin-reset-of-every-user.js";
import { FakePinResetStore } from "./test-support/fake-pin-reset-store.js";

function storeWithUsers() {
  const store = new FakePinResetStore();
  store.seedUser({ id: "admin-1", hasPin: true });
  store.seedUser({ id: "u-1", hasPin: true });
  store.seedUser({ id: "u-2", hasPin: false });
  store.seedUser({ id: "u-3", hasPin: true });
  return store;
}

describe("requirePinResetOfEveryUser", () => {
  it("removes the PIN of every user holding one, administrators included, and counts them", async () => {
    const store = storeWithUsers();

    const outcome = await requirePinResetOfEveryUser({ store }, { actorId: "admin-1" });

    expect(outcome).toEqual({ kind: "required", users: 3 });
    expect(store.current.users.map(({ hasPin }) => hasPin)).toEqual([false, false, false, false]);
  });

  it("audits each reset user with the administrator's id and nobody else", async () => {
    const store = storeWithUsers();

    await requirePinResetOfEveryUser({ store }, { actorId: "admin-1" });

    expect(store.current.audits).toEqual([
      { actorId: "admin-1", userId: "admin-1" },
      { actorId: "admin-1", userId: "u-1" },
      { actorId: "admin-1", userId: "u-3" },
    ]);
  });

  it("reports zero users when nobody holds a PIN", async () => {
    const store = new FakePinResetStore();
    store.seedUser({ id: "u-1", hasPin: false });

    const outcome = await requirePinResetOfEveryUser({ store }, { actorId: "admin-1" });

    expect(outcome).toEqual({ kind: "required", users: 0 });
    expect(store.current.audits).toEqual([]);
  });

  it("leaves every PIN in place when the reset fails midway", async () => {
    const store = storeWithUsers();
    const before = store.snapshot();
    store.failAfterFirstRemoval = true;

    await expect(requirePinResetOfEveryUser({ store }, { actorId: "admin-1" })).rejects.toThrow(
      "requirePinResetOfEveryUser failed",
    );

    expect(store.current).toEqual(before);
  });
});
