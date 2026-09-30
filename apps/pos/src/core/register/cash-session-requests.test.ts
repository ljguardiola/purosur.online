import { PERMISSION_KEYS } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import {
  type CashSessionRequestDeps,
  currentCashSession,
  openCashSessionFor,
} from "./cash-session-requests";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const NOW = new Date("2026-09-30T12:00:00.000Z");

let database: LocalDatabase;

function deps(overrides: Partial<CashSessionRequestDeps> = {}): CashSessionRequestDeps {
  let count = 0;
  return {
    database,
    readOutboxChainKey: async () => CHAIN_KEY,
    now: () => NOW,
    ids: {
      next: () => {
        count += 1;
        return `id-${count}`;
      },
    },
    ...overrides,
  };
}

function addPerson(id: string, roleId: string, firstName = "Ada"): void {
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, ?, ?, 's', 1, 1)",
    )
    .run(id, firstName, roleId);
}

function addRole(id: string, options: { isAdministrator?: boolean; permissions?: string[] }): void {
  database
    .prepare("INSERT INTO roles (id, name, is_administrator, version) VALUES (?, ?, ?, 1)")
    .run(id, id, options.isAdministrator ? 1 : 0);
  for (const key of options.permissions ?? []) {
    database
      .prepare("INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, ?, 1)")
      .run(id, key);
  }
}

function enrolled(): void {
  database
    .prepare("INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1)")
    .run();
  database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  addRole("cashier", { permissions: ["sell_and_charge"] });
  addPerson("u1", "cashier");
  enrolled();
});

afterEach(() => {
  database.close();
});

describe("opening a cash session on the register", () => {
  it("answers the opened session with its id, when it was opened and its float", async () => {
    expect(await openCashSessionFor(deps(), "u1", 5000)).toEqual({
      kind: "opened",
      session: { id: "id-1", opened_at: "2026-09-30T12:00:00.000Z", opening_float: 5000 },
    });
    expect(database.prepare("SELECT id, opened_by FROM cash_sessions").all()).toEqual([
      { id: "id-1", opened_by: "u1" },
    ]);
  });

  it("answers unavailable without touching the database when the register holds no outbox chain key", async () => {
    database.close();

    expect(
      await openCashSessionFor(deps({ readOutboxChainKey: async () => undefined }), "u1", 5000),
    ).toEqual({
      kind: "unavailable",
    });
  });

  it.each([
    ["a person without the permission to sell", "u2", 5000, "not_permitted"],
    ["a second session", "u1", 5000, "already_open"],
    ["an opening float that is not an amount", "u1", -1, "invalid_opening_float"],
  ])("answers the domain's refusal of %s", async (_case, userId, openingFloat, kind) => {
    addRole("viewer", {});
    addPerson("u2", "viewer", "Bruno");
    if (kind === "already_open") {
      await openCashSessionFor(deps(), "u1", 100);
    }

    expect(await openCashSessionFor(deps(), userId, openingFloat)).toEqual({ kind });
  });

  it("answers unavailable when the register does not know its own identity yet", async () => {
    database.prepare("DELETE FROM own_register").run();

    expect(await openCashSessionFor(deps(), "u1", 5000)).toEqual({ kind: "unavailable" });
  });
});

describe("the open cash session", () => {
  it("is none while no session is open", () => {
    expect(currentCashSession(database)).toBeNull();
  });

  it("names its opener with the permissions of the opener's role", async () => {
    await openCashSessionFor(deps(), "u1", 5000);

    expect(currentCashSession(database)).toEqual({
      id: "id-1",
      opened_at: "2026-09-30T12:00:00.000Z",
      opened_by: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
    });
  });

  it("gives an Administrator opener every permission", async () => {
    addRole("admin", { isAdministrator: true });
    addPerson("u3", "admin", "Carla");
    await openCashSessionFor(deps(), "u3", 0);

    expect(currentCashSession(database)?.opened_by.permission_keys).toEqual([...PERMISSION_KEYS]);
  });

  it("cannot be read when its opener is no longer an active person", async () => {
    await openCashSessionFor(deps(), "u1", 5000);
    database.prepare("UPDATE users SET active = 0").run();

    expect(() => currentCashSession(database)).toThrow();
  });
});
