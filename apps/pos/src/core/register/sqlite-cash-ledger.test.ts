import { createHmac } from "node:crypto";
import type { CashMovement, ClosedCashSession, OpenedCashSession } from "@purosur/domain";
import { closeCashSession, openCashSession } from "@purosur/domain/register/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { readOpenSessionMovements, SqliteCashLedger } from "./sqlite-cash-ledger";

const CHAIN_KEY_BYTES = Buffer.from("0123456789abcdef0123456789abcdef");
const CHAIN_KEY = CHAIN_KEY_BYTES.toString("base64");
const OPENED_AT = new Date("2026-09-30T12:00:00.000Z");

let database: LocalDatabase;
let ledger: SqliteCashLedger;

function session(overrides: Partial<OpenedCashSession> = {}): OpenedCashSession {
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
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
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

describe("the movements of a session", () => {
  function movement(id: string, sessionId: string, amount: number): CashMovement {
    return { id, sessionId, type: "SALE", amount, actorId: "u1", occurredAt: OPENED_AT };
  }

  it("are those recorded against it, as the domain holds them, and none of another session's", () => {
    ledger.transaction((tx) => {
      tx.recordOpenedSession(session());
      tx.recordCashMovement(movement("m-1", "session-1", 300));
      tx.recordCashMovement({
        ...movement("m-2", "session-1", 200),
        authorizedBy: "u2",
        reason: "tip",
        ref: { type: "sale", id: "sale-1" },
      });
    });
    database
      .prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = ?")
      .run("2026-09-30T20:00:00.000Z");
    ledger.transaction((tx) => {
      tx.recordOpenedSession(session({ id: "session-2" }));
      tx.recordCashMovement(movement("m-3", "session-2", 999));
    });

    expect(ledger.transaction((tx) => tx.sessionMovements("session-1"))).toEqual([
      movement("m-1", "session-1", 300),
      {
        ...movement("m-2", "session-1", 200),
        authorizedBy: "u2",
        reason: "tip",
        ref: { type: "sale", id: "sale-1" },
      },
    ]);
  });
});

function addSale(id: string, state: string, lineTotals: number[], sessionId = "session-1"): void {
  database
    .prepare(
      "INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at) VALUES (?, 'register-1', 'device-1', ?, 'u1', ?, ?)",
    )
    .run(id, sessionId, state, state === "OPEN" ? null : OPENED_AT.toISOString());
  lineTotals.forEach((lineTotal, index) => {
    database
      .prepare(
        "INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total) VALUES (?, ?, ?, ?, 'Yerba', 1, ?, 'pl-1', ?)",
      )
      .run(`${id}-line-${index}`, id, index + 1, `p${index}${id}`, lineTotal, lineTotal);
  });
}

describe("the open sale", () => {
  beforeEach(() => {
    ledger.transaction((tx) => tx.recordOpenedSession(session()));
  });

  it("is none while the session has no sale", () => {
    expect(ledger.transaction((tx) => tx.openSale("session-1"))).toBeUndefined();
  });

  it("is none while the session only has sales that are over", () => {
    addSale("sale-1", "COMPLETED", [1500]);
    addSale("sale-2", "VOIDED", [700]);

    expect(ledger.transaction((tx) => tx.openSale("session-1"))).toBeUndefined();
  });

  it("carries the lines of the sale in progress", () => {
    addSale("sale-1", "COMPLETED", [999]);
    addSale("sale-2", "OPEN", [1500, 250]);

    const openSale = ledger.transaction((tx) => tx.openSale("session-1"));

    expect(openSale?.lines.map((line) => line.lineTotal)).toEqual([1500, 250]);
  });

  it("carries no lines for a sale in progress whose lines were all removed", () => {
    addSale("sale-1", "OPEN", []);

    expect(ledger.transaction((tx) => tx.openSale("session-1"))).toEqual({ lines: [] });
  });

  it("is none for a session whose sale is not the one in progress", () => {
    addSale("sale-1", "OPEN", [1500]);

    expect(ledger.transaction((tx) => tx.openSale("session-2"))).toBeUndefined();
  });

  describe("when closing the session", () => {
    function close() {
      return closeCashSession<never>(
        {
          ledger,
          clock: { now: () => OPENED_AT },
          ids: { next: () => "id-1" },
          authority: { authorize: async () => ({ kind: "granted", grant: { closerId: "u1" } }) },
        },
        { sessionId: "session-1", countedCash: 5000 },
      );
    }

    it("refuses while a sale is in progress and leaves the session open", async () => {
      deviceId("device-1");
      addSale("sale-1", "OPEN", [1500, 250]);

      expect(await close()).toEqual({ kind: "open_sale", total: 1750 });
      expect(database.prepare("SELECT state FROM cash_sessions").all()).toEqual([
        { state: "OPEN" },
      ]);
    });

    it("closes when the sales are over", async () => {
      deviceId("device-1");
      addSale("sale-1", "COMPLETED", [1500]);

      expect((await close()).kind).toBe("closed");
    });
  });
});

describe("a closed session", () => {
  const closed: ClosedCashSession = {
    ...session(),
    state: "CLOSED",
    closedBy: "u2",
    closedAt: new Date("2026-09-30T20:00:00.000Z"),
    expectedCash: 5300,
    countedCash: 5000,
    difference: -300,
  };

  it("keeps who closed it, when, and what was expected, counted and missing", () => {
    ledger.transaction((tx) => {
      tx.recordOpenedSession(session());
      tx.recordClosedSession(closed);
    });

    expect(database.prepare("SELECT * FROM cash_sessions").all()).toEqual([
      {
        id: "session-1",
        register_id: "register-1",
        device_id: "device-1",
        opened_by: "u1",
        opened_at: "2026-09-30T12:00:00.000Z",
        opening_float: 5000,
        state: "CLOSED",
        closed_by: "u2",
        closed_at: "2026-09-30T20:00:00.000Z",
        expected_cash: 5300,
        counted_cash: 5000,
        difference: -300,
      },
    ]);
    expect(ledger.transaction((tx) => tx.openSession())).toBeUndefined();
  });

  it("can be followed by a new session", () => {
    ledger.transaction((tx) => {
      tx.recordOpenedSession(session());
      tx.recordClosedSession(closed);
      tx.recordOpenedSession(session({ id: "session-2" }));
    });

    expect(ledger.transaction((tx) => tx.openSession()?.id)).toBe("session-2");
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

describe("a ledger given no outbox chain key", () => {
  it("refuses to append an outbox event", () => {
    deviceId("device-1");
    const keyless = new SqliteCashLedger(database, new SqliteSignInStore(database), undefined);

    expect(() =>
      keyless.transaction((tx) =>
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
      ),
    ).toThrow("the ledger has no outbox chain key");
    expect(count("outbox")).toBe(0);
  });
});

describe("an outbox event appended through the ledger", () => {
  it("is chained with the key the ledger was given", () => {
    deviceId("device-1");
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
    deviceId("device-1");
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
    return openCashSession<{ openerId: string }, never>(
      {
        ledger,
        clock: { now: () => OPENED_AT },
        ids,
        authority: { authorize: async () => ({ kind: "granted", grant: { openerId: "u1" } }) },
      },
      { openingFloat: 5000 },
    );
  }

  it("writes the session, its opening movement and the outbox event together", async () => {
    addCashier("u1", ["sell_and_charge"]);
    ownRegister();
    deviceId("device-1");

    const outcome = await open();

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

  it("writes nothing when the outbox refuses its event", async () => {
    addCashier("u1", ["sell_and_charge"]);
    ownRegister();
    deviceId("device-1");
    database.prepare("DROP TABLE outbox").run();

    await expect(open()).rejects.toThrow();

    expect([count("cash_sessions"), count("cash_movements"), counter()]).toEqual([0, 0, 0]);
  });
});

describe("the open session's movements", () => {
  function addPerson(id: string, firstName: string): void {
    database
      .prepare(
        "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, ?, 'cashier', 's', 1, 1)",
      )
      .run(id, firstName);
  }

  function record(
    id: string,
    overrides: Partial<CashMovement> = {},
    sessionId = "session-1",
  ): CashMovement {
    const movement: CashMovement = {
      id,
      sessionId,
      type: "CASH_IN",
      amount: 1000,
      actorId: "u1",
      occurredAt: OPENED_AT,
      ...overrides,
    };
    ledger.transaction((tx) => tx.recordCashMovement(movement));
    return movement;
  }

  it("is none while no session is open", () => {
    expect(readOpenSessionMovements(database)).toBeUndefined();
  });

  it("is empty for a session with no movements", () => {
    ledger.transaction((tx) => tx.recordOpenedSession(session()));

    expect(readOpenSessionMovements(database)).toEqual([]);
  });

  it("lists each movement with its reason, time, and the first names of who did it and who authorized it", () => {
    addPerson("u1", "Ada");
    addPerson("u2", "Grace");
    ledger.transaction((tx) => tx.recordOpenedSession(session()));
    record("m1", {
      type: "WITHDRAWAL",
      amount: 7000,
      reason: "Retiro al banco",
      authorizedBy: "u2",
      occurredAt: new Date("2026-09-30T13:00:00.000Z"),
    });

    expect(readOpenSessionMovements(database)).toEqual([
      {
        id: "m1",
        type: "WITHDRAWAL",
        amount: 7000,
        reason: "Retiro al banco",
        direction: "out",
        occurred_at: "2026-09-30T13:00:00.000Z",
        actor: { user_id: "u1", first_name: "Ada" },
        authorized_by: { user_id: "u2", first_name: "Grace" },
      },
    ]);
  });

  it("tells which way each movement moves the cash", () => {
    addPerson("u1", "Ada");
    ledger.transaction((tx) => tx.recordOpenedSession(session()));
    record("opening", { type: "OPENING", occurredAt: new Date("2026-09-30T08:00:00.000Z") });
    record("refund", { type: "REFUND", occurredAt: new Date("2026-09-30T09:00:00.000Z") });
    record("closing", { type: "CLOSING", occurredAt: new Date("2026-09-30T10:00:00.000Z") });

    expect(readOpenSessionMovements(database)?.map((movement) => movement.direction)).toEqual([
      "in",
      "out",
      "none",
    ]);
  });

  it("leaves the reason and the authorizer empty when the movement has none", () => {
    addPerson("u1", "Ada");
    ledger.transaction((tx) => tx.recordOpenedSession(session()));
    record("m1", { type: "OPENING" });

    expect(readOpenSessionMovements(database)).toEqual([
      expect.objectContaining({ reason: null, authorized_by: null }),
    ]);
  });

  it("lists them oldest first, keeping the order they were recorded in when they share a time", () => {
    addPerson("u1", "Ada");
    ledger.transaction((tx) => tx.recordOpenedSession(session()));
    record("late", { occurredAt: new Date("2026-09-30T15:00:00.000Z") });
    record("tie-first", { occurredAt: new Date("2026-09-30T14:00:00.000Z") });
    record("tie-second", { occurredAt: new Date("2026-09-30T14:00:00.000Z") });
    record("early", { occurredAt: new Date("2026-09-30T13:00:00.000Z") });

    expect(readOpenSessionMovements(database)?.map((movement) => movement.id)).toEqual([
      "early",
      "tie-first",
      "tie-second",
      "late",
    ]);
  });

  it("leaves out the movements of a closed session", () => {
    addPerson("u1", "Ada");
    ledger.transaction((tx) => tx.recordOpenedSession(session()));
    record("old");
    database
      .prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = ?")
      .run("2026-09-30T20:00:00.000Z");
    ledger.transaction((tx) => tx.recordOpenedSession(session({ id: "session-2" })));
    record("new", {}, "session-2");

    expect(readOpenSessionMovements(database)?.map((movement) => movement.id)).toEqual(["new"]);
  });

  it("names a person who was deactivated since", () => {
    addPerson("u1", "Ada");
    ledger.transaction((tx) => tx.recordOpenedSession(session()));
    record("m1");
    database.prepare("UPDATE users SET active = 0, removed = 1").run();

    expect(readOpenSessionMovements(database)?.[0]?.actor).toEqual({
      user_id: "u1",
      first_name: "Ada",
    });
  });
});
