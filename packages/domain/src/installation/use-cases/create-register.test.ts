import { describe, expect, it, vi } from "vitest";
import { createRegister } from "./create-register.js";
import { FakeBranchRegisterStore } from "./test-support/fake-branch-register-store.js";

const BRANCH = "branch-1";
const ACTOR = "user-1";

describe("createRegister", () => {
  it("creates the register in the branch and records who created it", async () => {
    const store = new FakeBranchRegisterStore();

    const outcome = await createRegister(store, {
      locationId: BRANCH,
      name: "Caja 1",
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "created", register: { id: "register-1", name: "Caja 1" } });
    const state = store.snapshot();
    expect(state.registers).toEqual([{ id: "register-1", locationId: BRANCH, name: "Caja 1" }]);
    expect(state.registerCreations).toEqual([
      { registerId: "register-1", locationId: BRANCH, name: "Caja 1", actorId: ACTOR },
    ]);
  });

  it("rejects a name another register of the branch already has, ignoring letter case", async () => {
    const store = new FakeBranchRegisterStore();
    store.seedRegister({ id: "register-7", locationId: BRANCH, name: "Caja 1" });

    const outcome = await createRegister(store, {
      locationId: BRANCH,
      name: "CAJA 1",
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
    const state = store.snapshot();
    expect(state.registers).toHaveLength(1);
    expect(state.registerCreations).toEqual([]);
  });

  it("accepts a name a register of another branch already has", async () => {
    const store = new FakeBranchRegisterStore();
    store.seedRegister({ id: "register-7", locationId: "branch-2", name: "Caja 1" });

    const outcome = await createRegister(store, {
      locationId: BRANCH,
      name: "Caja 1",
      actorId: ACTOR,
    });

    expect(outcome.kind).toBe("created");
  });

  it("maps a name race caught by the store's insert to name_taken, leaving nothing behind", async () => {
    const store = new FakeBranchRegisterStore();
    store.registerNameConflicts.add("caja 1");

    const outcome = await createRegister(store, {
      locationId: BRANCH,
      name: "Caja 1",
      actorId: ACTOR,
    });

    expect(outcome).toEqual({ kind: "name_taken" });
    const state = store.snapshot();
    expect(state.registers).toEqual([]);
    expect(state.registerCreations).toEqual([]);
  });

  it("leaves no register behind when recording who created it fails", async () => {
    const store = new FakeBranchRegisterStore();
    store.failingWrites.add("recordRegisterCreation");

    await expect(
      createRegister(store, { locationId: BRANCH, name: "Caja 1", actorId: ACTOR }),
    ).rejects.toThrow("recordRegisterCreation failed");
    expect(store.snapshot().registers).toEqual([]);
  });

  it("lets an error that is not a name conflict through", async () => {
    const store = new FakeBranchRegisterStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(
      createRegister(store, { locationId: BRANCH, name: "Caja 1", actorId: ACTOR }),
    ).rejects.toThrow("connection lost");
  });

  it("checks the name before writing, inside one transaction", async () => {
    const store = new FakeBranchRegisterStore();

    await createRegister(store, { locationId: BRANCH, name: "Caja 1", actorId: ACTOR });

    expect(store.operationOrder).toEqual([
      "registerNameTaken",
      "recordRegister",
      "recordRegisterCreation",
    ]);
    expect(store.transactionCount).toBe(1);
  });
});
