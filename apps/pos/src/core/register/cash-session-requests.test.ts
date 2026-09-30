import { PERMISSION_KEYS } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createActionGate } from "../access/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../access/signed-in-person";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { SqliteLocalReplica } from "../sync/sqlite-local-replica";
import {
  type CashSessionRequestDeps,
  currentCashSession,
  openCashSessionFor,
} from "./cash-session-requests";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const NOW = new Date("2026-09-30T12:00:00.000Z");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

function deps(overrides: Partial<CashSessionRequestDeps> = {}): CashSessionRequestDeps {
  let count = 0;
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => undefined,
      hashPin: async () => "",
      now: () => NOW,
    }),
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
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
});

afterEach(() => {
  database.close();
});

function openedSessions(): unknown[] {
  return database.prepare("SELECT id, opened_by FROM cash_sessions").all();
}

describe("opening a cash session on the register", () => {
  it("opens it for the person signed in on the register and answers its id, when it was opened and its float", async () => {
    expect(await openCashSessionFor(deps(), 5000)).toEqual({
      kind: "opened",
      session: { id: "id-1", opened_at: "2026-09-30T12:00:00.000Z", opening_float: 5000 },
    });
    expect(openedSessions()).toEqual([{ id: "id-1", opened_by: "u1" }]);
  });

  it("answers unavailable without touching the database when the register holds no outbox chain key", async () => {
    database.close();

    expect(
      await openCashSessionFor(deps({ readOutboxChainKey: async () => undefined }), 5000),
    ).toEqual({
      kind: "unavailable",
    });
  });

  it("refuses while nobody is signed in, and opens nothing", async () => {
    signedInPerson.clear();

    expect(await openCashSessionFor(deps(), 5000)).toEqual({ kind: "not_signed_in" });
    expect(openedSessions()).toEqual([]);
  });

  it("refuses a signed-in person without the permission to sell, and opens nothing", async () => {
    addRole("viewer", {});
    addPerson("u2", "viewer", "Bruno");
    signedInPerson.set("u2");

    expect(await openCashSessionFor(deps(), 5000)).toEqual({ kind: "not_permitted" });
    expect(openedSessions()).toEqual([]);
  });

  it("refuses the signed-in person once a pull takes the permission to sell off their role", async () => {
    await new SqliteLocalReplica(database).savePage({
      changes: [
        {
          changeSeq: 1,
          change: {
            change_seq: 1,
            entity: "role",
            entity_id: "cashier",
            row: { name: "cashier", is_administrator: false, permission_keys: [], version: 2 },
          },
        },
      ],
      cursor: 1,
      hasMore: false,
    });

    expect(await openCashSessionFor(deps(), 5000)).toEqual({ kind: "not_permitted" });
    expect(openedSessions()).toEqual([]);
  });

  it.each([
    ["a second session", 5000, "already_open"],
    ["an opening float that is not an amount", -1, "invalid_opening_float"],
  ])("answers the domain's refusal of %s", async (_case, openingFloat, kind) => {
    if (kind === "already_open") {
      await openCashSessionFor(deps(), 100);
    }

    expect(await openCashSessionFor(deps(), openingFloat)).toEqual({ kind });
  });

  it("answers unavailable when the register does not know its own identity yet", async () => {
    database.prepare("DELETE FROM own_register").run();

    expect(await openCashSessionFor(deps(), 5000)).toEqual({ kind: "unavailable" });
  });
});

describe("the open cash session", () => {
  it("is none while no session is open", () => {
    expect(currentCashSession(database)).toBeNull();
  });

  it("names its opener with the permissions of the opener's role", async () => {
    await openCashSessionFor(deps(), 5000);

    expect(currentCashSession(database)).toEqual({
      id: "id-1",
      opened_at: "2026-09-30T12:00:00.000Z",
      opened_by: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
    });
  });

  it("gives an Administrator opener every permission", async () => {
    addRole("admin", { isAdministrator: true });
    addPerson("u3", "admin", "Carla");
    signedInPerson.set("u3");
    await openCashSessionFor(deps(), 0);

    expect(currentCashSession(database)?.opened_by.permission_keys).toEqual([...PERMISSION_KEYS]);
  });

  it.each([
    ["deactivated", "UPDATE users SET active = 0"],
    ["removed", "UPDATE users SET removed = 1"],
    ["left without a PIN", "DELETE FROM pin_verifiers"],
  ])("is still the open session when its opener was %s", async (_case, change) => {
    database.prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES ('u1', 'v')").run();
    await openCashSessionFor(deps(), 5000);
    database.prepare(change).run();

    expect(currentCashSession(database)?.opened_by).toEqual({
      user_id: "u1",
      first_name: "Ada",
      permission_keys: ["sell_and_charge"],
    });
  });

  it("names its opener with the permissions the opener's role holds now", async () => {
    await openCashSessionFor(deps(), 5000);
    database.prepare("UPDATE roles SET removed = 1").run();

    expect(currentCashSession(database)?.opened_by.permission_keys).toEqual([]);
  });

  it("is still the open session when the opener's row is gone, with no name and no permissions", async () => {
    await openCashSessionFor(deps(), 5000);
    database.prepare("DELETE FROM users").run();

    expect(currentCashSession(database)?.opened_by).toEqual({
      user_id: "u1",
      first_name: "",
      permission_keys: [],
    });
  });
});
