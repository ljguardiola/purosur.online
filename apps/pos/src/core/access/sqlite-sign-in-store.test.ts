import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { SqliteSignInStore } from "./sqlite-sign-in-store";

let database: LocalDatabase;
let store: SqliteSignInStore;

interface UserSeed {
  id: string;
  firstName?: string;
  roleId?: string;
  salt?: string | null;
  active?: boolean;
  removed?: boolean;
  verifier?: string | null;
}

function addUser(seed: UserSeed): void {
  const {
    id,
    firstName = "Ada",
    roleId = "cashier",
    salt = `salt-of-${id}`,
    active = true,
    removed = false,
    verifier = `verifier-of-${id}`,
  } = seed;
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version, removed) VALUES (?, ?, ?, ?, ?, 1, ?)",
    )
    .run(id, firstName, roleId, salt, active ? 1 : 0, removed ? 1 : 0);
  if (verifier !== null) {
    database
      .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
      .run(id, verifier);
  }
}

function addRole(id: string, options: { isAdministrator?: boolean; removed?: boolean } = {}): void {
  database
    .prepare(
      "INSERT INTO roles (id, name, is_administrator, version, removed) VALUES (?, ?, ?, 1, ?)",
    )
    .run(id, id, options.isAdministrator ? 1 : 0, options.removed ? 1 : 0);
}

function grant(roleId: string, permissionKey: string, active = true): void {
  database
    .prepare("INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, ?, ?)")
    .run(roleId, permissionKey, active ? 1 : 0);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  store = new SqliteSignInStore(database);
  addRole("cashier");
});

afterEach(() => {
  database.close();
});

describe("signable users", () => {
  it("lists users who are active, not removed and have a PIN, by id and first name", () => {
    addUser({ id: "u1", firstName: "Ada" });
    addUser({ id: "u2", firstName: "Bruno" });

    expect(store.signableUsers()).toEqual(
      expect.arrayContaining([
        { id: "u1", first_name: "Ada" },
        { id: "u2", first_name: "Bruno" },
      ]),
    );
    expect(store.signableUsers()).toHaveLength(2);
  });

  it("leaves out a user with no PIN", () => {
    addUser({ id: "u1", verifier: null });

    expect(store.signableUsers()).toEqual([]);
  });

  it("leaves out a user with a PIN but no salt", () => {
    addUser({ id: "u1", salt: null });

    expect(store.signableUsers()).toEqual([]);
  });

  it("leaves out a deactivated user", () => {
    addUser({ id: "u1", active: false });

    expect(store.signableUsers()).toEqual([]);
  });

  it("leaves out a removed user", () => {
    addUser({ id: "u1", removed: true });

    expect(store.signableUsers()).toEqual([]);
  });

  it("lists nothing on a register that pulled no users", () => {
    expect(store.signableUsers()).toEqual([]);
  });
});

describe("a user's sign-in record", () => {
  it("holds the first name, salt, verifier and the active permissions of the role", () => {
    addUser({ id: "u1", firstName: "Ada", salt: "the-salt", verifier: "the-verifier" });
    grant("cashier", "sell_and_charge");
    grant("cashier", "void_sale");
    grant("cashier", "adjust_stock", false);

    expect(store.signInRecord("u1")).toEqual({
      firstName: "Ada",
      salt: "the-salt",
      verifier: "the-verifier",
      access: {
        isAdministrator: false,
        permissionKeys: expect.arrayContaining(["sell_and_charge", "void_sale"]),
      },
    });
    expect(store.signInRecord("u1")?.access.permissionKeys).toHaveLength(2);
  });

  it("marks a user whose role is an Administrator's", () => {
    addRole("admin", { isAdministrator: true });
    addUser({ id: "u1", roleId: "admin" });

    expect(store.signInRecord("u1")?.access.isAdministrator).toBe(true);
  });

  it("gives a user whose role was removed no access at all", () => {
    addRole("gone", { isAdministrator: true, removed: true });
    grant("gone", "sell_and_charge");
    addUser({ id: "u1", roleId: "gone" });

    expect(store.signInRecord("u1")?.access).toEqual({
      isAdministrator: false,
      permissionKeys: [],
    });
  });

  it("gives a user whose role was never pulled no access at all", () => {
    addUser({ id: "u1", roleId: "unknown-role" });

    expect(store.signInRecord("u1")?.access).toEqual({
      isAdministrator: false,
      permissionKeys: [],
    });
  });

  it("has no record for a user the register does not know", () => {
    expect(store.signInRecord("nobody")).toBeUndefined();
  });

  it.each([
    ["without a PIN", { verifier: null }],
    ["deactivated", { active: false }],
    ["removed", { removed: true }],
    ["without a salt", { salt: null }],
  ])("has no record for a user who is %s", (_case, seed) => {
    addUser({ id: "u1", ...seed });

    expect(store.signInRecord("u1")).toBeUndefined();
  });
});
