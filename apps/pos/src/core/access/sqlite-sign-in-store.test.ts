import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

describe("an active person", () => {
  it("holds the first name and the active permissions of the role", () => {
    addUser({ id: "u1", firstName: "Ada" });
    grant("cashier", "sell_and_charge");
    grant("cashier", "adjust_stock", false);

    expect(store.activePerson("u1")).toEqual({
      firstName: "Ada",
      access: { isAdministrator: false, permissionKeys: ["sell_and_charge"] },
    });
  });

  it("marks a person whose role is an Administrator's", () => {
    addRole("admin", { isAdministrator: true });
    addUser({ id: "u1", roleId: "admin" });

    expect(store.activePerson("u1")?.access.isAdministrator).toBe(true);
  });

  it("gives a person whose role was removed no access at all", () => {
    addRole("gone", { isAdministrator: true, removed: true });
    grant("gone", "sell_and_charge");
    addUser({ id: "u1", roleId: "gone" });

    expect(store.activePerson("u1")?.access).toEqual({
      isAdministrator: false,
      permissionKeys: [],
    });
  });

  it("is found without a PIN, since the person is already signed in", () => {
    addUser({ id: "u1", verifier: null, salt: null });

    expect(store.activePerson("u1")?.firstName).toBe("Ada");
  });

  it("is not found for a person the register does not know", () => {
    expect(store.activePerson("nobody")).toBeUndefined();
  });

  it.each([
    ["deactivated", { active: false }],
    ["removed", { removed: true }],
  ])("is not found for a person who is %s", (_case, seed) => {
    addUser({ id: "u1", ...seed });

    expect(store.activePerson("u1")).toBeUndefined();
  });
});

describe("any person", () => {
  it.each([
    ["deactivated", { active: false }],
    ["removed", { removed: true }],
    ["without a PIN", { verifier: null }],
  ])("is found when %s, with the access the role holds now", (_case, seed) => {
    addUser({ id: "u1", firstName: "Ada", ...seed });
    grant("cashier", "sell_and_charge");

    expect(store.anyPerson("u1")).toEqual({
      firstName: "Ada",
      access: { isAdministrator: false, permissionKeys: ["sell_and_charge"] },
    });
  });

  it("is not found for a person the register does not know", () => {
    expect(store.anyPerson("nobody")).toBeUndefined();
  });
});

describe("the users who can authorize a permission", () => {
  it("lists the signable users whose role grants it, by id and first name", () => {
    grant("cashier", "record_cash_in");
    addRole("supervisor");
    grant("supervisor", "record_cash_in");
    addRole("stocker");
    grant("stocker", "adjust_stock");
    addUser({ id: "u1", firstName: "Ada", roleId: "cashier" });
    addUser({ id: "u2", firstName: "Bruno", roleId: "supervisor" });
    addUser({ id: "u3", firstName: "Carla", roleId: "stocker" });

    expect(store.authorizers("record_cash_in")).toEqual(
      expect.arrayContaining([
        { id: "u1", first_name: "Ada" },
        { id: "u2", first_name: "Bruno" },
      ]),
    );
    expect(store.authorizers("record_cash_in")).toHaveLength(2);
  });

  it("lists an Administrator for any permission", () => {
    addRole("admin", { isAdministrator: true });
    addUser({ id: "u1", firstName: "Ada", roleId: "admin" });

    expect(store.authorizers("void_sale")).toEqual([{ id: "u1", first_name: "Ada" }]);
  });

  it("leaves out a role whose grant of the permission was withdrawn", () => {
    grant("cashier", "record_cash_in", false);
    addUser({ id: "u1" });

    expect(store.authorizers("record_cash_in")).toEqual([]);
  });

  it("leaves out a user whose role was removed", () => {
    addRole("gone", { isAdministrator: true, removed: true });
    grant("gone", "record_cash_in");
    addUser({ id: "u1", roleId: "gone" });

    expect(store.authorizers("record_cash_in")).toEqual([]);
  });

  it("leaves out a user whose role was never pulled", () => {
    addUser({ id: "u1", roleId: "unknown-role" });

    expect(store.authorizers("record_cash_in")).toEqual([]);
  });

  it.each([
    ["without a PIN", { verifier: null }],
    ["deactivated", { active: false }],
    ["removed", { removed: true }],
    ["without a salt", { salt: null }],
  ])("leaves out a user who is %s", (_case, seed) => {
    grant("cashier", "record_cash_in");
    addUser({ id: "u1", ...seed });

    expect(store.authorizers("record_cash_in")).toEqual([]);
  });
});

describe("a user's PIN sign-in failures", () => {
  const FIRST = new Date("2026-05-01T10:00:00.000Z");
  const SECOND = new Date("2026-05-01T10:00:05.000Z");

  it("are none for a user who never got the PIN wrong", () => {
    addUser({ id: "u1" });

    expect(store.pinSignInFailures("u1")).toBeUndefined();
  });

  it("count each failure recorded and remember when the last one happened", () => {
    addUser({ id: "u1" });

    expect(store.recordPinSignInFailure("u1", FIRST)).toEqual({
      consecutiveFailures: 1,
      lastFailedAt: FIRST,
    });
    expect(store.recordPinSignInFailure("u1", SECOND)).toEqual({
      consecutiveFailures: 2,
      lastFailedAt: SECOND,
    });
    expect(store.pinSignInFailures("u1")).toEqual({
      consecutiveFailures: 2,
      lastFailedAt: SECOND,
    });
  });

  it("are kept apart for each user", () => {
    addUser({ id: "u1" });
    addUser({ id: "u2" });

    store.recordPinSignInFailure("u1", FIRST);
    store.recordPinSignInFailure("u1", SECOND);
    store.recordPinSignInFailure("u2", FIRST);

    expect(store.pinSignInFailures("u1")?.consecutiveFailures).toBe(2);
    expect(store.pinSignInFailures("u2")?.consecutiveFailures).toBe(1);
  });

  it("are cleared for one user without touching another's", () => {
    addUser({ id: "u1" });
    addUser({ id: "u2" });
    store.recordPinSignInFailure("u1", FIRST);
    store.recordPinSignInFailure("u2", FIRST);

    store.clearPinSignInFailures("u1");

    expect(store.pinSignInFailures("u1")).toBeUndefined();
    expect(store.pinSignInFailures("u2")?.consecutiveFailures).toBe(1);
  });

  it("start again from one after being cleared", () => {
    addUser({ id: "u1" });
    store.recordPinSignInFailure("u1", FIRST);
    store.recordPinSignInFailure("u1", SECOND);
    store.clearPinSignInFailures("u1");

    expect(store.recordPinSignInFailure("u1", SECOND).consecutiveFailures).toBe(1);
  });

  it("give back one withdrawn failure, keeping the others", () => {
    addUser({ id: "u1" });
    store.recordPinSignInFailure("u1", FIRST);
    store.recordPinSignInFailure("u1", SECOND);

    store.withdrawPinSignInFailure("u1");

    expect(store.pinSignInFailures("u1")?.consecutiveFailures).toBe(1);
  });

  it("are none once their only failure is withdrawn", () => {
    addUser({ id: "u1" });
    store.recordPinSignInFailure("u1", FIRST);

    store.withdrawPinSignInFailure("u1");

    expect(store.pinSignInFailures("u1")).toBeUndefined();
    expect(store.recordPinSignInFailure("u1", SECOND).consecutiveFailures).toBe(1);
  });

  it("stay none when a failure is withdrawn from a user who has none", () => {
    addUser({ id: "u1" });
    addUser({ id: "u2" });
    store.recordPinSignInFailure("u2", FIRST);

    store.withdrawPinSignInFailure("u1");

    expect(store.pinSignInFailures("u1")).toBeUndefined();
    expect(store.pinSignInFailures("u2")?.consecutiveFailures).toBe(1);
  });

  it("survive the register restarting", () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-sign-in-failures-"));
    try {
      const path = join(folder, "register.sqlite");
      const first = openLocalDatabase(path, LOCAL_MIGRATIONS);
      first
        .prepare(
          "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1)",
        )
        .run();
      const beforeRestart = new SqliteSignInStore(first);
      beforeRestart.recordPinSignInFailure("u1", FIRST);
      beforeRestart.recordPinSignInFailure("u1", SECOND);
      first.close();

      const second = openLocalDatabase(path, LOCAL_MIGRATIONS);

      expect(new SqliteSignInStore(second).pinSignInFailures("u1")).toEqual({
        consecutiveFailures: 2,
        lastFailedAt: SECOND,
      });
      second.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
