import { createHmac } from "node:crypto";
import type { CashSession } from "@purosur/domain";
import { openCashSession } from "@purosur/domain/register/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { SqliteCashLedger } from "./sqlite-cash-ledger";

const CHAIN_KEY_BYTES = Buffer.from("0123456789abcdef0123456789abcdef");
const CHAIN_KEY = CHAIN_KEY_BYTES.toString("base64");
const OPENED_AT = new Date("2026-09-30T12:00:00.000Z");

let database: LocalDatabase;
let ledger: SqliteCashLedger;

function session(overrides: Partial<CashSession> = {}): CashSession {
  return {
    id: "session-1",
    registerId: "register-1",
    deviceId: "device-1",
    openedBy: "u1",
    openedAt: OPENED_AT,
    openingFloat: 5000,
    state: "OPEN",
    ...overrides,
  };
}

function addCashier(id: string, permissions: string[], options: { active?: boolean } = {}): void {
  database
    .prepare(
      "INSERT OR IGNORE INTO roles (id, name, is_administrator, version) VALUES (?, ?, 0, 1)",
    )
    .run("cashier", "Cajera");
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, 'Ada', 'cashier', 's', ?, 1)",
    )
    .run(id, options.active === false ? 0 : 1);
  for (const key of permissions) {
    database
      .prepare(
        "INSERT OR IGNORE INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', ?, 1)",
      )
      .run(key);
  }
}

function ownRegister(removed = false): void {
  database
    .prepare(
      "INSERT INTO own_register (id, name, version, removed) VALUES ('register-1', 'Caja 1', 1, ?)",
    )
    .run(removed ? 1 : 0);
}

function deviceId(id: string | null): void {
  database.prepare("UPDATE sync_state SET device_id = ?").run(id);
}

function count(table: string): number {
  return database.prepare<[], { total: number }>(`SELECT count(*) AS total FROM ${table}`).get()
    ?.total as number;
}

function counter(): number {
  return database
    .prepare<[], { last_device_seq: number }>("SELECT last_device_seq FROM sync_state")
    .get()?.last_device_seq as number;
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  ledger = new SqliteCashLedger(database, new SqliteSignInStore(database), CHAIN_KEY);
});

afterEach(() => {
  database.close();
});

describe("the opener's access", () => {
  it("is the access of an active person", () => {
    addCashier("u1", ["sell_and_charge"]);

    expect(ledger.transaction((tx) => tx.openerAccess("u1"))).toEqual({
      isAdministrator: false,
      permissionKeys: ["sell_and_charge"],
    });
  });

  it("is none for a person who is not active or not known", () => {
    addCashier("u1", ["sell_and_charge"], { active: false });

    expect(ledger.transaction((tx) => tx.openerAccess("u1"))).toBeUndefined();
    expect(ledger.transaction((tx) => tx.openerAccess("nobody"))).toBeUndefined();
  });
});

describe("the register's identity", () => {
  it("joins the register's own id with the device id of the installation", () => {
    ownRegister();
    deviceId("device-1");

    expect(ledger.transaction((tx) => tx.registerIdentity())).toEqual({
      registerId: "register-1",
      deviceId: "device-1",
    });
  });

  it("is missing before the register was pulled", () => {
    deviceId("device-1");

    expect(ledger.transaction((tx) => tx.registerIdentity())).toBeUndefined();
  });

  it("is missing once the register was removed", () => {
    ownRegister(true);
    deviceId("device-1");

    expect(ledger.transaction((tx) => tx.registerIdentity())).toBeUndefined();
  });

  it("is missing before the installation holds a device id", () => {
    ownRegister();

    expect(ledger.transaction((tx) => tx.registerIdentity())).toBeUndefined();
  });
});

describe("the open session", () => {
  it("is none while no session was opened", () => {
    expect(ledger.transaction((tx) => tx.openSession())).toBeUndefined();
  });

  it("is the session recorded as open, as the domain holds it", () => {
    ledger.transaction((tx) => tx.recordOpenedSession(session()));

    expect(ledger.transaction((tx) => tx.openSession())).toEqual(session());
  });

  it("is none once the only session was closed", () => {
    ledger.transaction((tx) => tx.recordOpenedSession(session()));
    database
      .prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = ?")
      .run("2026-09-30T20:00:00.000Z");

    expect(ledger.transaction((tx) => tx.openSession())).toBeUndefined();
  });

  it("can be followed by a new session once the previous one was closed", () => {
    ledger.transaction((tx) => tx.recordOpenedSession(session()));
    database
      .prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = ?")
      .run("2026-09-30T20:00:00.000Z");

    ledger.transaction((tx) => tx.recordOpenedSession(session({ id: "session-2" })));

    expect(ledger.transaction((tx) => tx.openSession()?.id)).toBe("session-2");
  });

  it("is never a second one for the same register", () => {
    ledger.transaction((tx) => tx.recordOpenedSession(session()));

    expect(() =>
      ledger.transaction((tx) => tx.recordOpenedSession(session({ id: "session-2" }))),
    ).toThrow();
    expect(count("cash_sessions")).toBe(1);
  });

  it("refuses an opening float the domain would not accept", () => {
    expect(() =>
      ledger.transaction((tx) => tx.recordOpenedSession(session({ openingFloat: -1 }))),
    ).toThrow();
  });
});

describe("a cash movement", () => {
  it("is recorded against its session with the optional parts left empty", () => {
    ledger.transaction((tx) => {
      tx.recordOpenedSession(session());
      tx.recordCashMovement({
        id: "movement-1",
        sessionId: "session-1",
        type: "OPENING",
        amount: 5000,
        actorId: "u1",
        occurredAt: OPENED_AT,
      });
    });

    expect(database.prepare("SELECT * FROM cash_movements").all()).toEqual([
      {
        id: "movement-1",
        session_id: "session-1",
        type: "OPENING",
        amount: 5000,
        reason: null,
        ref_type: null,
        ref_id: null,
        actor_id: "u1",
        authorized_by: null,
        occurred_at: "2026-09-30T12:00:00.000Z",
      },
    ]);
  });

  it("keeps the reason and who authorized it when it has them", () => {
    ledger.transaction((tx) => {
      tx.recordOpenedSession(session());
      tx.recordCashMovement({
        id: "movement-1",
        sessionId: "session-1",
        type: "WITHDRAWAL",
        amount: 1000,
        actorId: "u1",
        occurredAt: OPENED_AT,
        reason: "Retiro al banco",
        authorizedBy: "u2",
      });
    });

    expect(database.prepare("SELECT reason, authorized_by FROM cash_movements").all()).toEqual([
      { reason: "Retiro al banco", authorized_by: "u2" },
    ]);
  });

  it("keeps what it refers to as a type and an id", () => {
    ledger.transaction((tx) => {
      tx.recordOpenedSession(session());
      tx.recordCashMovement({
        id: "movement-1",
        sessionId: "session-1",
        type: "SALE",
        amount: 1000,
        actorId: "u1",
        occurredAt: OPENED_AT,
        ref: { type: "SALE", id: "sale-1" },
      });
    });

    expect(database.prepare("SELECT ref_type, ref_id FROM cash_movements").all()).toEqual([
      { ref_type: "SALE", ref_id: "sale-1" },
    ]);
  });

  it("is refused for a session that was never recorded", () => {
    expect(() =>
      ledger.transaction((tx) =>
        tx.recordCashMovement({
          id: "movement-1",
          sessionId: "nowhere",
          type: "OPENING",
          amount: 5000,
          actorId: "u1",
          occurredAt: OPENED_AT,
        }),
      ),
    ).toThrow();
  });
});

describe("an outbox event appended through the ledger", () => {
  it("is chained with the key the ledger was given", () => {
    ledger.transaction((tx) =>
      tx.appendOutboxEvent({
        event_id: "event-1",
        aggregate_type: "CashSession",
        aggregate_id: "session-1",
        event_type: "cash_session_opened",
        schema_version: 1,
        payload: { opening_float: 5000 },
        occurred_at: "2026-09-30T12:00:00.000Z",
        actor_id: "u1",
      }),
    );

    const canonical =
      '{"actor_id":"u1","aggregate_id":"session-1","aggregate_type":"CashSession","device_seq":1,"event_id":"event-1","event_type":"cash_session_opened","occurred_at":"2026-09-30T12:00:00.000Z","payload":{"opening_float":5000},"schema_version":1}';
    const expected = createHmac("sha256", CHAIN_KEY_BYTES)
      .update(Buffer.alloc(32))
      .update(canonical)
      .digest("base64");
    expect(database.prepare("SELECT device_seq, chain_hmac FROM outbox").all()).toEqual([
      { device_seq: 1, chain_hmac: expected },
    ]);
  });
});

describe("a transaction of the ledger", () => {
  it("returns what its work returns", () => {
    expect(ledger.transaction(() => "done")).toBe("done");
  });

  it("leaves nothing behind when its work throws after writing", () => {
    expect(() =>
      ledger.transaction((tx) => {
        tx.recordOpenedSession(session());
        tx.recordCashMovement({
          id: "movement-1",
          sessionId: "session-1",
          type: "OPENING",
          amount: 5000,
          actorId: "u1",
          occurredAt: OPENED_AT,
        });
        tx.appendOutboxEvent({
          event_id: "event-1",
          aggregate_type: "CashSession",
          aggregate_id: "session-1",
          event_type: "cash_session_opened",
          schema_version: 1,
          payload: {},
          occurred_at: "2026-09-30T12:00:00.000Z",
          actor_id: "u1",
        });
        throw new Error("the work failed");
      }),
    ).toThrow("the work failed");

    expect([count("cash_sessions"), count("cash_movements"), count("outbox"), counter()]).toEqual([
      0, 0, 0, 0,
    ]);
  });
});

describe("opening a cash session through the ledger", () => {
  let issued = 0;
  const ids = {
    next: () => {
      issued += 1;
      return `id-${issued}`;
    },
  };

  function open() {
    return openCashSession(
      { ledger, clock: { now: () => OPENED_AT }, ids },
      { openerId: "u1", openingFloat: 5000 },
    );
  }

  it("writes the session, its opening movement and the outbox event together", () => {
    addCashier("u1", ["sell_and_charge"]);
    ownRegister();
    deviceId("device-1");

    const outcome = open();

    expect(outcome.kind).toBe("opened");
    expect(count("cash_sessions")).toBe(1);
    expect(database.prepare("SELECT type, amount FROM cash_movements").all()).toEqual([
      { type: "OPENING", amount: 5000 },
    ]);
    expect(
      database.prepare("SELECT event_type, aggregate_id, device_seq FROM outbox").all(),
    ).toEqual([{ event_type: "cash_session_opened", aggregate_id: "id-1", device_seq: 1 }]);
    expect(counter()).toBe(1);
  });

  it("writes nothing when the outbox refuses its event", () => {
    addCashier("u1", ["sell_and_charge"]);
    ownRegister();
    deviceId("device-1");
    database.prepare("DROP TABLE outbox").run();

    expect(open).toThrow();

    expect([count("cash_sessions"), count("cash_movements"), counter()]).toEqual([0, 0, 0]);
  });
});
