import { describe, expect, it } from "vitest";
import { createRole } from "./create-role.js";
import { FakeRoleStore } from "./test-support/fake-role-store.js";

const input = {
  name: "Depósito",
  permissionKeys: ["sell_and_charge", "view_sales_history"],
  actorId: "u-1",
};

function storeWithRole(name: string): FakeRoleStore {
  const store = new FakeRoleStore();
  store.seedRole({
    id: "r-1",
    name,
    isAdministrator: false,
    version: 1,
    storedPermissionKeys: [],
    holders: [],
  });
  return store;
}

describe("createRole", () => {
  it("creates the role with its permissions and no holders", async () => {
    const store = new FakeRoleStore();

    const outcome = await createRole({ store }, input);

    expect(outcome).toEqual({
      kind: "created",
      role: {
        id: "new-role-1",
        name: "Depósito",
        isAdministrator: false,
        permissionKeys: ["sell_and_charge", "view_sales_history"],
        userCount: 0,
      },
    });
    expect(store.snapshot().roles).toMatchObject([
      {
        id: "new-role-1",
        name: "Depósito",
        storedPermissionKeys: ["sell_and_charge", "view_sales_history"],
      },
    ]);
  });

  it("records a change with no previous value, as the actor", async () => {
    const store = new FakeRoleStore();

    await createRole({ store }, input);

    expect(store.snapshot().changes).toEqual([
      {
        roleId: "new-role-1",
        actorId: "u-1",
        previous: null,
        next: { name: "Depósito", permissionKeys: ["sell_and_charge", "view_sales_history"] },
      },
    ]);
  });

  it("refuses a name another role already has, whatever its letter case, and writes nothing", async () => {
    const store = storeWithRole("DEPÓSITO");

    const outcome = await createRole({ store }, input);

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().roles).toHaveLength(1);
    expect(store.snapshot().changes).toEqual([]);
  });

  it("refuses a name that lands concurrently and leaves nothing behind", async () => {
    const store = new FakeRoleStore();
    store.racedNames.add("depósito");

    const outcome = await createRole({ store }, input);

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot().roles).toEqual([]);
  });

  it("rolls the role back when recording the change fails", async () => {
    const store = new FakeRoleStore();
    store.failingWrites.add("recordRoleChange");

    await expect(createRole({ store }, input)).rejects.toThrow("recordRoleChange failed");

    expect(store.snapshot().roles).toEqual([]);
  });

  it("checks the name before writing anything", async () => {
    const store = new FakeRoleStore();

    await createRole({ store }, input);

    expect(store.operationOrder).toEqual(["roleNameTaken", "insertRole", "recordRoleChange"]);
  });
});
