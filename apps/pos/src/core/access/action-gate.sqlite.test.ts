import type { SyncChange } from "@purosur/contracts";
import { encodePinHash } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import type { RegisterPulledChange } from "../sync/pulled-change";
import { SqliteLocalReplica } from "../sync/sqlite-local-replica";
import { type ActionGate, createActionGate } from "./action-gate";
import { signIn } from "./sign-in";
import { createSignedInPerson, type SignedInPerson } from "./signed-in-person";
import { SqliteSignInStore } from "./sqlite-sign-in-store";

const CASHIER_ID = "1e7b3a90-52c4-4d18-9f6a-8b0c2d4e6f71";
const MANAGER_ID = "2f8c4ba1-63d5-4e29-8a7b-9c1d3e5f7a82";
const CASHIER_ROLE_ID = "3a9d5cb2-74e6-4f3a-9b8c-0d2e4f6a8b93";
const MANAGER_ROLE_ID = "4bae6dc3-85f7-4a4b-8c9d-1e3f5a7b9ca4";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const SALT = encodePinHash(new Uint8Array(16).fill(1));

type UserRow = Extract<SyncChange, { entity: "user" }>["row"];
type RoleRow = Extract<SyncChange, { entity: "role" }>["row"];

function userRow(roleId: string, firstName: string): UserRow {
  return {
    first_name: firstName,
    role_id: roleId,
    salt: SALT,
    pin_hash: PIN_HASH,
    active: true,
    version: 1,
  };
}

function roleRow(name: string, permissionKeys: string[], version = 1): RoleRow {
  return {
    name,
    is_administrator: false,
    permission_keys: permissionKeys,
    version,
  };
}

function pulled(change: SyncChange): RegisterPulledChange {
  return { changeSeq: change.change_seq, change };
}

function roleChange(changeSeq: number, roleId: string, row: RoleRow): RegisterPulledChange {
  return pulled({ change_seq: changeSeq, entity: "role", entity_id: roleId, row });
}

function userChange(changeSeq: number, userId: string, row: UserRow): RegisterPulledChange {
  return pulled({ change_seq: changeSeq, entity: "user", entity_id: userId, row });
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;
let signedInPerson: SignedInPerson;
let gate: ActionGate;
let pulledUpTo = 0;

async function pull(...changes: RegisterPulledChange[]) {
  pulledUpTo = changes.at(-1)?.changeSeq ?? pulledUpTo;
  await replica.savePage({ changes, cursor: pulledUpTo, hasMore: false });
}

async function signInAs(userId: string) {
  const store = new SqliteSignInStore(database);
  const outcome = await signIn(
    {
      store,
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async () => PIN_HASH,
      now: () => new Date("2026-05-01T10:00:00.000Z"),
    },
    userId,
    "1234",
  );
  expect(outcome.kind).toBe("signed_in");
}

function cashIn(authorization?: { user_id: string; pin: string }) {
  const performed: string[] = [];
  const outcome = gate.run({ permission: "record_cash_in", authorization }, async () => {
    performed.push("cash in recorded");
    return "cash in recorded";
  });
  return { outcome, performed };
}

beforeEach(async () => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  replica = new SqliteLocalReplica(database);
  replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
  signedInPerson = createSignedInPerson();
  gate = createActionGate({
    store: new SqliteSignInStore(database),
    signedInPerson,
    readPepper: async () => PEPPER,
    hashPin: async (pin) => (pin === "1234" ? PIN_HASH : "hash-of-another-pin"),
    now: () => new Date("2026-05-01T10:00:00.000Z"),
  });
  pulledUpTo = 0;
  await pull(
    roleChange(1, CASHIER_ROLE_ID, roleRow("Cajera", ["sell_and_charge"])),
    roleChange(2, MANAGER_ROLE_ID, roleRow("Encargado", ["sell_and_charge", "record_cash_in"])),
    userChange(3, CASHIER_ID, userRow(CASHIER_ROLE_ID, "Ada")),
    userChange(4, MANAGER_ID, userRow(MANAGER_ROLE_ID, "Grace")),
  );
});

afterEach(() => {
  database.close();
});

describe("the action gate over the register's local database", () => {
  it("refuses a signed-in person whose role lacks the permission, and never runs the action", async () => {
    await signInAs(CASHIER_ID);

    const { outcome, performed } = cashIn();

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });

  it("refuses a signed-in person whose role lacks the permission even with an authorization from someone who lacks it too", async () => {
    await signInAs(CASHIER_ID);

    const { outcome, performed } = cashIn({ user_id: CASHIER_ID, pin: "1234" });

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });

  it("runs the action for a signed-in person whose role holds the permission", async () => {
    await signInAs(MANAGER_ID);

    const { outcome, performed } = cashIn();

    expect(await outcome).toEqual({
      kind: "performed",
      authorized_by: null,
      result: "cash in recorded",
    });
    expect(performed).toEqual(["cash in recorded"]);
  });

  it("runs the action for a signed-in person who lacks the permission with an authorization from someone who holds it", async () => {
    await signInAs(CASHIER_ID);

    const { outcome, performed } = cashIn({ user_id: MANAGER_ID, pin: "1234" });

    expect(await outcome).toEqual({
      kind: "performed",
      authorized_by: { user_id: MANAGER_ID, first_name: "Grace" },
      result: "cash in recorded",
    });
    expect(performed).toEqual(["cash in recorded"]);
  });

  it("refuses everything while nobody is signed in", async () => {
    const { outcome, performed } = cashIn();

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
  });

  it("refuses the next action of a signed-in person whose role loses the permission in a pull", async () => {
    await signInAs(MANAGER_ID);
    expect((await cashIn().outcome).kind).toBe("performed");

    await pull(roleChange(5, MANAGER_ROLE_ID, roleRow("Encargado", ["sell_and_charge"], 2)));
    const { outcome, performed } = cashIn();

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });

  it("refuses the next action of a signed-in person who is deactivated in a pull", async () => {
    await signInAs(MANAGER_ID);

    await pull(
      userChange(5, MANAGER_ID, {
        ...userRow(MANAGER_ROLE_ID, "Grace"),
        active: false,
        version: 2,
      }),
    );
    const { outcome, performed } = cashIn();

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });
});
