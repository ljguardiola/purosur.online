import { describe, expect, it } from "vitest";
import { editRole } from "./edit-role.js";
import { FakeRoleStore } from "./test-support/fake-role-store.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const clock = { now: () => new Date(NOW) };

interface Seed {
  name?: string;
  permissions?: string[];
  holders?: { id: string; name: string; active: boolean }[];
}

function fixture({ name = "Cajero", permissions = ["sell_and_charge"], holders = [] }: Seed = {}) {
  const store = new FakeRoleStore();
  store.seedRole({
    id: "r-1",
    name,
    isAdministrator: false,
    version: 3,
    storedPermissionKeys: permissions,
    holders,
  });
  store.seedRole({
    id: "r-2",
    name: "Gerente",
    isAdministrator: false,
    version: 1,
    storedPermissionKeys: [],
    holders: [],
  });
  store.seedRole({
    id: "r-admin",
    name: null,
    isAdministrator: true,
    version: 3,
    storedPermissionKeys: [],
    holders: [],
  });
  const edit = (change: {
    name?: string;
    permissionKeys?: string[];
    version?: number;
    id?: string;
  }) =>
    editRole(
      { store, clock },
      {
        id: change.id ?? "r-1",
        name: change.name ?? name,
        permissionKeys: change.permissionKeys ?? permissions,
        version: change.version ?? 3,
        actorId: "u-1",
      },
    );
  return { store, edit };
}

describe("editRole", () => {
  it("renames the role, replaces its permissions and bumps its version", async () => {
    const { store, edit } = fixture();

    const outcome = await edit({
      name: "Cajera",
      permissionKeys: ["view_sales_history", "sell_and_charge"],
    });

    expect(outcome).toEqual({
      kind: "applied",
      role: {
        id: "r-1",
        name: "Cajera",
        isAdministrator: false,
        permissionKeys: ["sell_and_charge", "view_sales_history"],
        userCount: 0,
        version: 4,
        assignedUsers: [],
      },
    });
    expect(store.snapshot().roles[0]).toMatchObject({
      name: "Cajera",
      version: 4,
      storedPermissionKeys: ["view_sales_history", "sell_and_charge"],
    });
  });

  it("answers with the role's active holders", async () => {
    const { edit } = fixture({
      holders: [
        { id: "u-2", name: "Ana", active: true },
        { id: "u-3", name: "Beto", active: false },
      ],
    });

    const outcome = await edit({ name: "Cajera" });

    expect(outcome).toMatchObject({
      kind: "applied",
      role: { userCount: 1, assignedUsers: [{ id: "u-2", name: "Ana" }] },
    });
  });

  it("records the change with both sides in catalog order", async () => {
    const { store, edit } = fixture({ permissions: ["view_sales_history", "sell_and_charge"] });

    await edit({ name: "Cajera", permissionKeys: ["view_sales_history"], version: 3 });

    expect(store.snapshot().changes).toEqual([
      {
        roleId: "r-1",
        actorId: "u-1",
        previous: { name: "Cajero", permissionKeys: ["sell_and_charge", "view_sales_history"] },
        next: { name: "Cajera", permissionKeys: ["view_sales_history"] },
      },
    ]);
  });

  it.each([
    ["an unknown role", { id: "nope" }],
    ["the Administrator role", { id: "r-admin" }],
    ["an outdated version", { version: 2 }],
  ])("refuses %s as stale and writes nothing", async (_label, change) => {
    const { store, edit } = fixture();
    const before = store.snapshot();

    const outcome = await edit({ name: "Cajera", ...change });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot()).toEqual(before);
  });

  it("refuses a name another role has, whatever its letter case, and writes nothing", async () => {
    const { store, edit } = fixture();
    const before = store.snapshot();

    const outcome = await edit({ name: "GERENTE" });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot()).toEqual(before);
  });

  it("lets the role keep its own name in another letter case", async () => {
    const { edit } = fixture();

    const outcome = await edit({ name: "CAJERO" });

    expect(outcome).toMatchObject({ kind: "applied", role: { name: "CAJERO", version: 4 } });
  });

  it("refuses a name that lands concurrently and leaves nothing behind", async () => {
    const { store, edit } = fixture();
    const before = store.snapshot();
    store.racedNames.add("cajera");

    const outcome = await edit({ name: "Cajera" });

    expect(outcome).toEqual({ kind: "name_taken" });
    expect(store.snapshot()).toEqual(before);
  });

  it("writes nothing when neither the name nor the permissions change", async () => {
    const { store, edit } = fixture({
      permissions: ["view_sales_history", "sell_and_charge"],
      holders: [{ id: "u-2", name: "Ana", active: true }],
    });
    const before = store.snapshot();

    const outcome = await edit({ permissionKeys: ["sell_and_charge", "view_sales_history"] });

    expect(outcome).toEqual({
      kind: "applied",
      role: {
        id: "r-1",
        name: "Cajero",
        isAdministrator: false,
        permissionKeys: ["sell_and_charge", "view_sales_history"],
        userCount: 1,
        version: 3,
        assignedUsers: [{ id: "u-2", name: "Ana" }],
      },
    });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).not.toContain("rewriteRole");
  });

  it("rewrites the role when one permission is swapped for another", async () => {
    const { store, edit } = fixture({ permissions: ["sell_and_charge", "view_sales_history"] });

    const outcome = await edit({ permissionKeys: ["sell_and_charge", "reprint_receipt"] });

    expect(outcome).toMatchObject({
      kind: "applied",
      role: { version: 4, permissionKeys: ["sell_and_charge", "reprint_receipt"] },
    });
    expect(store.operationOrder).toContain("rewriteRole");
  });

  it("takes the role's lock before checking the name, writes only afterwards and reads the holders last", async () => {
    const { store, edit } = fixture();

    await edit({ name: "Cajera" });

    expect(store.operationOrder).toEqual([
      "lockRole",
      "roleNameTaken",
      "storedPermissionKeys",
      "rewriteRole",
      "recordRoleChange",
      "activeRoleHolders",
    ]);
  });

  it("rolls the rewrite back when recording the change fails", async () => {
    const { store, edit } = fixture();
    const before = store.snapshot();
    store.failingWrites.add("recordRoleChange");

    await expect(edit({ name: "Cajera" })).rejects.toThrow("recordRoleChange failed");

    expect(store.snapshot()).toEqual(before);
  });

  describe("when the edit gives holders more access", () => {
    const holders = [
      { id: "u-2", name: "Ana", active: true },
      { id: "u-3", name: "Beto", active: false },
      { id: "u-4", name: "Carla", active: true },
    ];

    it("opens an alert for each active holder naming what was added", async () => {
      const { store, edit } = fixture({ holders });

      await edit({ permissionKeys: ["sell_and_charge", "view_sales_history"] });

      expect(store.snapshot().alerts).toEqual(
        ["u-2", "u-4"].map((holderId) => ({
          holderId,
          roleName: "Cajero",
          addedPermissionKeys: ["view_sales_history"],
          actorId: "u-1",
          openedAt: NOW,
        })),
      );
    });

    it("rolls the edit back when opening an alert fails", async () => {
      const { store, edit } = fixture({ holders });
      const before = store.snapshot();
      store.failingWrites.add("openAccessIncreasedAlert");

      await expect(
        edit({ permissionKeys: ["sell_and_charge", "view_sales_history"] }),
      ).rejects.toThrow("openAccessIncreasedAlert failed");

      expect(store.snapshot()).toEqual(before);
    });

    it("opens no alert when permissions are only removed or the name changes", async () => {
      const { store, edit } = fixture({ holders });

      await edit({ name: "Cajera" });
      await edit({ name: "Cajera", permissionKeys: [], version: 4 });

      expect(store.snapshot().alerts).toEqual([]);
    });
  });
});
