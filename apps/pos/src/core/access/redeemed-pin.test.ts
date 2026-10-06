import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteLocalReplica } from "../sync/sqlite-local-replica";
import { derivePinVerifier } from "./pin-verifier";
import { applyRedeemedPin } from "./redeemed-pin";
import { SqliteSignInStore } from "./sqlite-sign-in-store";

const USER_ID = "1e7b3a90-52c4-4d18-9f6a-8b0c2d4e6f71";
const OTHER_USER_ID = "2f8c4ba1-63d5-4e29-8a7b-9c1d3e5f7a82";
const ROLE_ID = "3a9d5cb2-74e6-4f3a-9b8c-0d2e4f6a8b93";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const OLD_HASH = "b2xkLWhhc2g";
const NEW_HASH = "bmV3LWhhc2g";

type UserRow = Extract<SyncChange, { entity: "user" }>["row"];

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    first_name: "Ada",
    role_id: ROLE_ID,
    salt: "b2xkLXNhbHQ",
    pin_hash: OLD_HASH,
    active: true,
    version: 4,
    ...overrides,
  };
}

async function pull(userId: string, row: UserRow, changeSeq = 1) {
  await replica.savePage({
    changes: [
      {
        changeSeq,
        change: { change_seq: changeSeq, entity: "user", entity_id: userId, row },
      },
    ],
    cursor: changeSeq,
    hasMore: false,
  });
}

const redemption = { user_id: USER_ID, salt: "bmV3LXNhbHQ", pin_hash: NEW_HASH };

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  replica = new SqliteLocalReplica(database);
  replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
});

afterEach(() => {
  database.close();
});

describe("applyRedeemedPin", () => {
  it("gives the user the new salt and a verifier derived from the new hash with the register's pepper", async () => {
    await pull(USER_ID, userRow());

    applyRedeemedPin(database, PEPPER, redemption);

    expect(replica.user(USER_ID)).toMatchObject({ salt: "bmV3LXNhbHQ" });
    expect(replica.pinVerifier(USER_ID)).toBe(derivePinVerifier(PEPPER, NEW_HASH));
  });

  it("remembers the user on this register", async () => {
    await pull(USER_ID, userRow());

    applyRedeemedPin(database, PEPPER, redemption);

    expect(new SqliteSignInStore(database).signableUsers()).toEqual([
      { id: USER_ID, first_name: "Ada" },
    ]);
  });

  it("remembers nobody for a user the register has not pulled yet", () => {
    applyRedeemedPin(database, PEPPER, redemption);

    expect(database.prepare("SELECT user_id FROM remembered_users").all()).toEqual([]);
  });

  it("gives a user who had no PIN its first verifier", async () => {
    await pull(USER_ID, userRow({ salt: null, pin_hash: null }));

    applyRedeemedPin(database, PEPPER, redemption);

    expect(replica.pinVerifier(USER_ID)).toBe(derivePinVerifier(PEPPER, NEW_HASH));
  });

  it("leaves the user's version and every other field as pulled", async () => {
    await pull(USER_ID, userRow());

    applyRedeemedPin(database, PEPPER, redemption);

    expect(replica.user(USER_ID)).toEqual({
      first_name: "Ada",
      role_id: ROLE_ID,
      salt: "bmV3LXNhbHQ",
      active: true,
      version: 4,
      removed: false,
    });
  });

  it("leaves other users untouched", async () => {
    await pull(USER_ID, userRow());
    await pull(OTHER_USER_ID, userRow({ first_name: "Grace", salt: "c2FsdA" }), 2);

    applyRedeemedPin(database, PEPPER, redemption);

    expect(replica.user(OTHER_USER_ID)).toMatchObject({ salt: "c2FsdA" });
    expect(replica.pinVerifier(OTHER_USER_ID)).toBe(derivePinVerifier(PEPPER, OLD_HASH));
  });

  it("never keeps the new hash in any table", async () => {
    await pull(USER_ID, userRow());

    applyRedeemedPin(database, PEPPER, redemption);

    const tables = database
      .prepare<[], { name: string }>("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all();
    for (const { name } of tables) {
      expect(JSON.stringify(database.prepare(`SELECT * FROM "${name}"`).all())).not.toContain(
        NEW_HASH,
      );
    }
  });

  it("writes nothing for a user the register has not pulled yet", () => {
    applyRedeemedPin(database, PEPPER, redemption);

    expect(replica.user(USER_ID)).toBeUndefined();
    expect(replica.pinVerifier(USER_ID)).toBeUndefined();
  });

  it("writes nothing for a user marked removed, whose next pull brings it back", async () => {
    await pull(USER_ID, userRow());
    replica.adoptDevice({ deviceId: "device-b", pepper: PEPPER });

    applyRedeemedPin(database, PEPPER, redemption);

    expect(replica.user(USER_ID)).toMatchObject({ salt: "b2xkLXNhbHQ", removed: true });
    expect(replica.pinVerifier(USER_ID)).toBeUndefined();
  });

  it("agrees with the verifier the next pull of the same user derives", async () => {
    await pull(USER_ID, userRow());
    applyRedeemedPin(database, PEPPER, redemption);
    const applied = replica.pinVerifier(USER_ID);

    await pull(USER_ID, userRow({ salt: "bmV3LXNhbHQ", pin_hash: NEW_HASH, version: 5 }), 2);

    expect(replica.pinVerifier(USER_ID)).toBe(applied);
  });

  it("clears the PIN sign-in failures of the user who chose the new PIN, and only theirs", async () => {
    await pull(USER_ID, userRow());
    await pull(OTHER_USER_ID, userRow({ first_name: "Grace" }), 2);
    const store = new SqliteSignInStore(database);
    const failedAt = new Date("2026-05-01T10:00:00.000Z");
    for (const id of [USER_ID, OTHER_USER_ID]) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        store.recordPinSignInFailure(id, failedAt);
      }
    }

    applyRedeemedPin(database, PEPPER, redemption);

    expect(store.pinSignInFailures(USER_ID)).toBeUndefined();
    expect(store.pinSignInFailures(OTHER_USER_ID)?.consecutiveFailures).toBe(8);
  });

  it("keeps the failures of a user marked removed, whose redemption writes nothing", async () => {
    await pull(USER_ID, userRow());
    const store = new SqliteSignInStore(database);
    store.recordPinSignInFailure(USER_ID, new Date("2026-05-01T10:00:00.000Z"));
    database.prepare("UPDATE users SET removed = 1").run();

    applyRedeemedPin(database, PEPPER, redemption);

    expect(store.pinSignInFailures(USER_ID)?.consecutiveFailures).toBe(1);
  });
});
