import { createHmac } from "node:crypto";
import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const USER_ID = "1e7b3a90-52c4-4d18-9f6a-8b0c2d4e6f71";
const OTHER_USER_ID = "2f8c4ba1-63d5-4e29-8a7b-9c1d3e5f7a82";
const ROLE_ID = "3a9d5cb2-74e6-4f3a-9b8c-0d2e4f6a8b93";
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const OTHER_PEPPER = Buffer.alloc(32, 9).toString("base64url");

type UserRow = Extract<SyncChange, { entity: "user" }>["row"];
type RoleRow = Extract<SyncChange, { entity: "role" }>["row"];

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    first_name: "Ada",
    role_id: ROLE_ID,
    salt: "c2FsdA",
    pin_hash: PIN_HASH,
    active: true,
    version: 1,
    ...overrides,
  };
}

function roleRow(overrides: Partial<RoleRow> = {}): RoleRow {
  return {
    name: "Cajera",
    is_administrator: false,
    permission_keys: ["sell_and_charge", "adjust_stock"],
    version: 1,
    ...overrides,
  };
}

function pulled(change: SyncChange): RegisterPulledChange {
  return { changeSeq: change.change_seq, change };
}

function userChange(changeSeq: number, row: UserRow, entityId = USER_ID): RegisterPulledChange {
  return pulled({ change_seq: changeSeq, entity: "user", entity_id: entityId, row });
}

function roleChange(changeSeq: number, row: RoleRow): RegisterPulledChange {
  return pulled({ change_seq: changeSeq, entity: "role", entity_id: ROLE_ID, row });
}

function removalChange(
  changeSeq: number,
  removedEntity: "user" | "role",
  entityId: string,
  version: number,
): RegisterPulledChange {
  return pulled({
    change_seq: changeSeq,
    entity: "removal",
    entity_id: entityId,
    removed_entity: removedEntity,
    version,
  });
}

function verifierOf(pepper: string, pinHash: string): string {
  return createHmac("sha256", Buffer.from(pepper, "base64url")).update(pinHash).digest("base64url");
}

async function save(...changes: RegisterPulledChange[]) {
  const cursor = changes.at(-1)?.changeSeq ?? 0;
  await replica.savePage({ changes, cursor, hasMore: false });
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  replica = new SqliteLocalReplica(database);
  replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
});

afterEach(() => {
  database.close();
});

describe("the register's local copy of the users, roles and permissions it pulls", () => {
  it("saves a user with its name, role, salt and version, active and not removed", async () => {
    await save(userChange(1, userRow({ version: 3 })));

    expect(replica.user(USER_ID)).toEqual({
      first_name: "Ada",
      role_id: ROLE_ID,
      salt: "c2FsdA",
      active: true,
      version: 3,
      removed: false,
    });
  });

  it("holds a verifier derived from the PIN hash with the register's pepper", async () => {
    await save(userChange(1, userRow()));

    expect(replica.pinVerifier(USER_ID)).toBe(verifierOf(PEPPER, PIN_HASH));
  });

  it("never keeps the PIN hash itself, in any table", async () => {
    await save(userChange(1, userRow()), roleChange(2, roleRow()));

    const tables = database
      .prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all();
    for (const { name } of tables) {
      expect(JSON.stringify(database.prepare(`SELECT * FROM "${name}"`).all())).not.toContain(
        PIN_HASH,
      );
    }
  });

  it("saves a user with no PIN with no salt and no verifier", async () => {
    await save(userChange(1, userRow({ salt: null, pin_hash: null })));

    expect(replica.user(USER_ID)).toMatchObject({ salt: null });
    expect(replica.pinVerifier(USER_ID)).toBeUndefined();
  });

  it("saves a deactivated user as inactive, keeping it", async () => {
    await save(userChange(1, userRow()), userChange(2, userRow({ active: false, version: 2 })));

    expect(replica.user(USER_ID)).toMatchObject({ active: false, version: 2, removed: false });
  });

  it("replaces a user, its salt and its verifier with a newer version", async () => {
    await save(userChange(1, userRow()));

    await save(
      userChange(
        2,
        userRow({ first_name: "Ada L.", salt: "b3RyYQ", pin_hash: "otro", version: 2 }),
      ),
    );

    expect(replica.user(USER_ID)).toMatchObject({
      first_name: "Ada L.",
      salt: "b3RyYQ",
      version: 2,
    });
    expect(replica.pinVerifier(USER_ID)).toBe(verifierOf(PEPPER, "otro"));
  });

  it("drops the verifier when a newer version has no PIN", async () => {
    await save(userChange(1, userRow()));

    await save(userChange(2, userRow({ salt: null, pin_hash: null, version: 2 })));

    expect(replica.user(USER_ID)).toMatchObject({ salt: null, version: 2 });
    expect(replica.pinVerifier(USER_ID)).toBeUndefined();
  });

  it("keeps a user and its verifier when an older or the same version arrives again", async () => {
    await save(userChange(1, userRow({ first_name: "Nueva", version: 3 })));

    await save(
      userChange(2, userRow({ first_name: "Vieja", pin_hash: "vieja", version: 2 })),
      userChange(3, userRow({ first_name: "Otra", pin_hash: "otra", version: 3 })),
    );

    expect(replica.user(USER_ID)).toMatchObject({ first_name: "Nueva", version: 3 });
    expect(replica.pinVerifier(USER_ID)).toBe(verifierOf(PEPPER, PIN_HASH));
  });

  it("does not bring a verifier back when an older version with a PIN arrives after one without", async () => {
    await save(userChange(1, userRow({ salt: null, pin_hash: null, version: 3 })));

    await save(userChange(2, userRow({ version: 2 })));

    expect(replica.pinVerifier(USER_ID)).toBeUndefined();
  });

  it("marks a removed user as removed at the removal's version, keeping the row and dropping the verifier", async () => {
    await save(userChange(1, userRow()));

    await save(removalChange(2, "user", USER_ID, 2));

    expect(replica.user(USER_ID)).toMatchObject({ removed: true, version: 2, first_name: "Ada" });
    expect(replica.pinVerifier(USER_ID)).toBeUndefined();
  });

  it("ignores a removal older than the user it holds, and one of a user it never held", async () => {
    await save(userChange(1, userRow({ version: 3 })));

    await save(removalChange(2, "user", USER_ID, 3), removalChange(3, "user", OTHER_USER_ID, 2));

    expect(replica.user(USER_ID)).toMatchObject({ removed: false, version: 3 });
    expect(replica.pinVerifier(USER_ID)).toBe(verifierOf(PEPPER, PIN_HASH));
    expect(replica.user(OTHER_USER_ID)).toBeUndefined();
  });

  it("does not bring a user back when an older version of it arrives after its removal", async () => {
    await save(userChange(1, userRow()), removalChange(2, "user", USER_ID, 2));

    await save(userChange(3, userRow()));

    expect(replica.user(USER_ID)).toMatchObject({ removed: true, version: 2 });
    expect(replica.pinVerifier(USER_ID)).toBeUndefined();
  });

  it("saves a role with its name, whether it is the Administrator, its version and the permissions it grants", async () => {
    await save(roleChange(1, roleRow({ version: 2 })));

    expect(replica.role(ROLE_ID)).toEqual({
      name: "Cajera",
      is_administrator: false,
      version: 2,
      removed: false,
      permissions: [
        { permission_key: "adjust_stock", active: true },
        { permission_key: "sell_and_charge", active: true },
      ],
    });
  });

  it("saves the Administrator role with no name and no listed permission", async () => {
    await save(
      roleChange(1, { name: null, is_administrator: true, permission_keys: [], version: 1 }),
    );

    expect(replica.role(ROLE_ID)).toEqual({
      name: null,
      is_administrator: true,
      version: 1,
      removed: false,
      permissions: [],
    });
  });

  it("marks the permissions a newer version no longer grants as inactive instead of deleting them, and active again once granted again", async () => {
    await save(roleChange(1, roleRow()));

    await save(roleChange(2, roleRow({ permission_keys: ["sell_and_charge"], version: 2 })));
    expect(replica.role(ROLE_ID)?.permissions).toEqual([
      { permission_key: "adjust_stock", active: false },
      { permission_key: "sell_and_charge", active: true },
    ]);

    await save(roleChange(3, roleRow({ version: 3 })));
    expect(replica.role(ROLE_ID)?.permissions).toEqual([
      { permission_key: "adjust_stock", active: true },
      { permission_key: "sell_and_charge", active: true },
    ]);
  });

  it("keeps a role and its permissions when an older or the same version arrives again", async () => {
    await save(roleChange(1, roleRow({ name: "Nueva", version: 3 })));

    await save(
      roleChange(2, roleRow({ name: "Vieja", permission_keys: [], version: 2 })),
      roleChange(3, roleRow({ name: "Otra", permission_keys: [], version: 3 })),
    );

    expect(replica.role(ROLE_ID)).toMatchObject({
      name: "Nueva",
      version: 3,
      permissions: [
        { permission_key: "adjust_stock", active: true },
        { permission_key: "sell_and_charge", active: true },
      ],
    });
  });

  it("marks a removed role as removed at the removal's version and its permissions as inactive, keeping them, and ignores an older removal", async () => {
    await save(roleChange(1, roleRow({ version: 3 })));
    await save(removalChange(2, "role", ROLE_ID, 3));
    expect(replica.role(ROLE_ID)).toMatchObject({ removed: false, version: 3 });

    await save(removalChange(3, "role", ROLE_ID, 4));

    expect(replica.role(ROLE_ID)).toEqual({
      name: "Cajera",
      is_administrator: false,
      version: 4,
      removed: true,
      permissions: [
        { permission_key: "adjust_stock", active: false },
        { permission_key: "sell_and_charge", active: false },
      ],
    });
  });

  it("does not bring a role back when an older version of it arrives after its removal", async () => {
    await save(roleChange(1, roleRow()), removalChange(2, "role", ROLE_ID, 2));

    await save(roleChange(3, roleRow()));

    expect(replica.role(ROLE_ID)).toMatchObject({
      removed: true,
      version: 2,
      permissions: [{ active: false }, { active: false }],
    });
  });

  it("derives every verifier again with the new pepper when another installation takes over, though no user version changed", async () => {
    await save(userChange(1, userRow()));

    replica.adoptDevice({ deviceId: "device-b", pepper: OTHER_PEPPER });
    expect(replica.pinVerifier(USER_ID)).toBeUndefined();
    expect(await replica.savedCursor()).toBe(0);
    await save(userChange(1, userRow()));

    expect(replica.pinVerifier(USER_ID)).toBe(verifierOf(OTHER_PEPPER, PIN_HASH));
    expect(replica.user(USER_ID)).toMatchObject({ first_name: "Ada", version: 1 });
  });

  it("holds none of the previous branch's users once it joins another branch, keeping their rows", async () => {
    await save(userChange(1, userRow()));

    replica.adoptDevice({ deviceId: "device-b", pepper: OTHER_PEPPER });
    await save(userChange(1, userRow({ first_name: "Grace" }), OTHER_USER_ID));

    expect(replica.user(USER_ID)).toMatchObject({ first_name: "Ada", version: 1, removed: true });
    expect(replica.pinVerifier(USER_ID)).toBeUndefined();
    expect(replica.user(OTHER_USER_ID)).toMatchObject({ first_name: "Grace", removed: false });
  });

  it("does not let an older version bring back a user it held before joining another installation", async () => {
    await save(userChange(1, userRow({ version: 3 })));

    replica.adoptDevice({ deviceId: "device-b", pepper: OTHER_PEPPER });
    await save(userChange(1, userRow({ first_name: "Vieja", version: 2 })));

    expect(replica.user(USER_ID)).toMatchObject({ first_name: "Ada", version: 3, removed: true });
    expect(replica.pinVerifier(USER_ID)).toBeUndefined();
  });

  it("keeps its verifiers for the installation that derived them", async () => {
    await save(userChange(1, userRow()));

    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });

    expect(replica.pinVerifier(USER_ID)).toBe(verifierOf(PEPPER, PIN_HASH));
    expect(await replica.savedCursor()).toBe(1);
  });

  it("saves nothing of a page with users, nor its cursor, when the page can't be saved whole", async () => {
    database.exec(
      "CREATE TRIGGER refuse_verifiers BEFORE INSERT ON pin_verifiers BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );

    await expect(save(roleChange(1, roleRow()), userChange(2, userRow()))).rejects.toThrow(
      "disk full",
    );

    expect(replica.role(ROLE_ID)).toBeUndefined();
    expect(replica.user(USER_ID)).toBeUndefined();
    expect(await replica.savedCursor()).toBe(0);
  });

  it("refuses a user's page when no installation has been adopted, saving nothing", async () => {
    const unadopted = new SqliteLocalReplica(openLocalDatabase(":memory:", LOCAL_MIGRATIONS));

    await expect(
      unadopted.savePage({ changes: [userChange(1, userRow())], cursor: 1, hasMore: false }),
    ).rejects.toThrow("no installation");

    expect(unadopted.user(USER_ID)).toBeUndefined();
    expect(await unadopted.savedCursor()).toBe(0);
  });
});
