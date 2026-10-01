import { encodePinHash, PERMISSION_KEYS } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActionGate } from "../access/action-gate";
import { derivePinVerifier } from "../access/pin-verifier";
import { createSignedInPerson, type SignedInPerson } from "../access/signed-in-person";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import {
  type CashSessionRequestDeps,
  cashBalanceFor,
  closeCashSessionFor,
  closeLockedCashSessionFor,
  currentCashSession,
  identifyLockedCloserFor,
  lockedClosersFor,
  openCashSessionFor,
  sessionOpenSaleFor,
} from "./cash-session-requests";
import { SqliteCashLedger } from "./sqlite-cash-ledger";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const NOW = new Date("2026-09-30T12:00:00.000Z");
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const AUTHORIZER_PIN = "1234";

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

function deps(overrides: Partial<CashSessionRequestDeps> = {}): CashSessionRequestDeps {
  let count = 0;
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async (pin) => (pin === AUTHORIZER_PIN ? PIN_HASH : "hash-of-another-pin"),
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
  vi.restoreAllMocks();
  database.close();
});

function openedSessions(): unknown[] {
  return database.prepare("SELECT id, opened_by FROM cash_sessions").all();
}

describe("opening a cash session on the register", () => {
  it("opens it for the person signed in on the register and answers the cash session as it stands for them", async () => {
    expect(await openCashSessionFor(deps(), 5000)).toEqual({
      kind: "opened",
      cash_session: {
        id: "id-1",
        opened_at: "2026-09-30T12:00:00.000Z",
        opened_by: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
        locked: false,
      },
    });
    expect(openedSessions()).toEqual([{ id: "id-1", opened_by: "u1" }]);
  });

  it("answers opened once the session is opened, though its opener can no longer be read", async () => {
    const readPerson = SqliteSignInStore.prototype.anyPerson;
    vi.spyOn(SqliteSignInStore.prototype, "anyPerson").mockImplementation(function (
      this: SqliteSignInStore,
      userId,
    ) {
      if (openedSessions().length > 0) {
        throw new Error("the register database is unavailable");
      }
      return readPerson.call(this, userId);
    });

    expect(await openCashSessionFor(deps(), 5000)).toEqual({
      kind: "opened",
      cash_session: {
        id: "id-1",
        opened_at: "2026-09-30T12:00:00.000Z",
        opened_by: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
        locked: false,
      },
    });
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
  it("is none while no session is open, and leaves the signed-in person signed in", () => {
    expect(currentCashSession(database, signedInPerson.userId())).toBeNull();
    expect(signedInPerson.userId()).toBe("u1");
  });

  it("leaves nobody signed in once it is read", async () => {
    await openCashSessionFor(deps(), 5000);
    signedInPerson.clear();

    currentCashSession(database, signedInPerson.userId());

    expect(signedInPerson.userId()).toBeUndefined();
  });

  it("signs nobody in when its opener cannot be read", async () => {
    await openCashSessionFor(deps(), 5000);
    signedInPerson.clear();
    database.exec("DROP TABLE role_permissions");

    expect(() => currentCashSession(database, signedInPerson.userId())).toThrow();
    expect(signedInPerson.userId()).toBeUndefined();
  });

  it("signs nobody in when the time it was opened cannot be read", async () => {
    await openCashSessionFor(deps(), 5000);
    signedInPerson.clear();
    database.prepare("UPDATE cash_sessions SET opened_at = 'not a date'").run();

    expect(() => currentCashSession(database, signedInPerson.userId())).toThrow();
    expect(signedInPerson.userId()).toBeUndefined();
  });

  it("names its opener with the permissions of the opener's role", async () => {
    await openCashSessionFor(deps(), 5000);

    expect(currentCashSession(database, signedInPerson.userId())).toEqual({
      id: "id-1",
      opened_at: "2026-09-30T12:00:00.000Z",
      opened_by: { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] },
      locked: false,
    });
  });

  it("is locked while nobody is signed in", async () => {
    await openCashSessionFor(deps(), 5000);
    signedInPerson.clear();

    expect(currentCashSession(database, signedInPerson.userId())?.locked).toBe(true);
  });

  it("is locked while a person who did not open it is signed in", async () => {
    await openCashSessionFor(deps(), 5000);
    addPerson("u2", "cashier", "Bruno");
    signedInPerson.set("u2");

    expect(currentCashSession(database, signedInPerson.userId())?.locked).toBe(true);
  });

  it("gives an Administrator opener every permission", async () => {
    addRole("admin", { isAdministrator: true });
    addPerson("u3", "admin", "Carla");
    signedInPerson.set("u3");
    await openCashSessionFor(deps(), 0);

    expect(
      currentCashSession(database, signedInPerson.userId())?.opened_by.permission_keys,
    ).toEqual([...PERMISSION_KEYS]);
  });

  it.each([
    ["deactivated", "UPDATE users SET active = 0"],
    ["removed", "UPDATE users SET removed = 1"],
    ["left without a PIN", "DELETE FROM pin_verifiers"],
  ])("is still the open session when its opener was %s", async (_case, change) => {
    database.prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES ('u1', 'v')").run();
    await openCashSessionFor(deps(), 5000);
    database.prepare(change).run();

    expect(currentCashSession(database, signedInPerson.userId())?.opened_by).toEqual({
      user_id: "u1",
      first_name: "Ada",
      permission_keys: ["sell_and_charge"],
    });
  });

  it("names its opener with the permissions the opener's role holds now", async () => {
    await openCashSessionFor(deps(), 5000);
    database.prepare("UPDATE roles SET removed = 1").run();

    expect(
      currentCashSession(database, signedInPerson.userId())?.opened_by.permission_keys,
    ).toEqual([]);
  });

  it("is still the open session when the opener's row is gone, with no name and no permissions", async () => {
    await openCashSessionFor(deps(), 5000);
    database.prepare("DELETE FROM users").run();

    expect(currentCashSession(database, signedInPerson.userId())?.opened_by).toEqual({
      user_id: "u1",
      first_name: "",
      permission_keys: [],
    });
  });
});

function addAuthorizer(id: string, permissions: string[]): void {
  addRole(`role-${id}`, { permissions });
  addPerson(id, `role-${id}`, "Grace");
  database
    .prepare("UPDATE users SET salt = ? WHERE id = ?")
    .run(encodePinHash(new Uint8Array(16).fill(1)), id);
  database
    .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
    .run(id, derivePinVerifier(PEPPER, PIN_HASH));
}

async function openAs(userId: string, openingFloat: number): Promise<string> {
  const previous = signedInPerson.userId();
  signedInPerson.set(userId);
  const outcome = await openCashSessionFor(deps(), openingFloat);
  if (previous === undefined) {
    signedInPerson.clear();
  } else {
    signedInPerson.set(previous);
  }
  if (outcome.kind !== "opened" || outcome.cash_session === null) {
    throw new Error("the session was not opened");
  }
  return outcome.cash_session.id;
}

function closeRequest(sessionId: string, countedCash: number) {
  return { sessionId, countedCash };
}

function movementsOf(type: string): unknown[] {
  return database
    .prepare("SELECT amount, actor_id, authorized_by FROM cash_movements WHERE type = ?")
    .all(type);
}

function closedSessionRow(): unknown {
  return database
    .prepare(
      "SELECT state, closed_by, closed_at, expected_cash, counted_cash, difference FROM cash_sessions",
    )
    .get();
}

function outboxRows(): { event_type: string; payload: string }[] {
  return database
    .prepare<[], { event_type: string; payload: string }>(
      "SELECT event_type, payload FROM outbox WHERE event_type = 'cash_session_closed'",
    )
    .all();
}

describe("closing a cash session on the register", () => {
  it("closes the session its own opener has open, with no permission to close anyone else's", async () => {
    const sessionId = await openAs("u1", 5000);

    expect(await closeCashSessionFor(deps(), closeRequest(sessionId, 4800))).toEqual({
      kind: "closed",
      session: { id: sessionId, expected_cash: 5000, counted_cash: 4800, difference: -200 },
    });
  });

  it("leaves the closing movement, the closed session and the outbox event written together", async () => {
    const sessionId = await openAs("u1", 5000);

    await closeCashSessionFor(deps(), closeRequest(sessionId, 4800));

    expect(movementsOf("CLOSING")).toEqual([{ amount: 4800, actor_id: "u1", authorized_by: null }]);
    expect(closedSessionRow()).toEqual({
      state: "CLOSED",
      closed_by: "u1",
      closed_at: "2026-09-30T12:00:00.000Z",
      expected_cash: 5000,
      counted_cash: 4800,
      difference: -200,
    });
    const events = outboxRows();
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]?.payload ?? "")).toEqual({
      closed_by: "u1",
      closed_at: "2026-09-30T12:00:00.000Z",
      expected_cash: 5000,
      counted_cash: 4800,
      difference: -200,
    });
  });

  it("keeps the person signed in after closing", async () => {
    const sessionId = await openAs("u1", 5000);

    await closeCashSessionFor(deps(), closeRequest(sessionId, 5000));

    expect(signedInPerson.userId()).toBe("u1");
  });

  it("lets a new session open once the last one is closed", async () => {
    const sessionId = await openAs("u1", 5000);
    const afterOpening = deps({ ids: { next: () => crypto.randomUUID() } });
    await closeCashSessionFor(afterOpening, closeRequest(sessionId, 5000));

    expect((await openCashSessionFor(afterOpening, 100)).kind).toBe("opened");
  });

  it("refuses to close another person's session, and writes nothing", async () => {
    addPerson("u2", "cashier", "Bruno");
    const sessionId = await openAs("u2", 5000);

    expect(await closeCashSessionFor(deps(), closeRequest(sessionId, 5000))).toEqual({
      kind: "lacks_permission",
    });
    expect(movementsOf("CLOSING")).toEqual([]);
    expect(outboxRows()).toEqual([]);
    expect(closedSessionRow()).toMatchObject({ state: "OPEN" });
  });

  it("refuses a signed-in person who did not open the session even when they hold the permission to close anyone's", async () => {
    addRole("supervisor", { permissions: ["sell_and_charge", "close_anothers_register_session"] });
    addPerson("u2", "supervisor", "Bruno");
    const sessionId = await openAs("u1", 5000);
    signedInPerson.set("u2");

    expect(await closeCashSessionFor(deps(), closeRequest(sessionId, 5000))).toEqual({
      kind: "lacks_permission",
    });
    expect(movementsOf("CLOSING")).toEqual([]);
  });

  it("refuses while nobody is signed in", async () => {
    const sessionId = await openAs("u1", 5000);
    signedInPerson.clear();

    expect(await closeCashSessionFor(deps(), closeRequest(sessionId, 5000))).toEqual({
      kind: "not_signed_in",
    });
  });

  it("answers no open session when none is open", async () => {
    expect(await closeCashSessionFor(deps(), closeRequest("id-1", 5000))).toEqual({
      kind: "no_open_session",
    });
  });

  it("answers no open session for a session other than the open one, and writes nothing", async () => {
    await openAs("u1", 5000);

    expect(await closeCashSessionFor(deps(), closeRequest("another", 5000))).toEqual({
      kind: "no_open_session",
    });
    expect(movementsOf("CLOSING")).toEqual([]);
  });

  it("answers the domain's refusal of a counted cash that is not an amount", async () => {
    const sessionId = await openAs("u1", 5000);

    expect(await closeCashSessionFor(deps(), closeRequest(sessionId, -1))).toEqual({
      kind: "invalid_counted_cash",
    });
  });

  it("answers unavailable when the register holds no outbox chain key", async () => {
    const sessionId = await openAs("u1", 5000);

    expect(
      await closeCashSessionFor(
        deps({ readOutboxChainKey: async () => undefined }),
        closeRequest(sessionId, 5000),
      ),
    ).toEqual({ kind: "unavailable" });
  });
});

describe("closing a locked register's cash session with another person's PIN", () => {
  const CLOSER = { user_id: "u9", pin: AUTHORIZER_PIN };

  async function lockedWithSessionOf(opener: string): Promise<string> {
    const sessionId = await openAs(opener, 5000);
    signedInPerson.clear();
    return sessionId;
  }

  it("closes it as the person whose PIN holds the permission, recording them as who closed it", async () => {
    addAuthorizer("u9", ["close_anothers_register_session"]);
    const sessionId = await lockedWithSessionOf("u1");

    const outcome = await closeLockedCashSessionFor(deps(), {
      sessionId,
      countedCash: 4800,
      closer: CLOSER,
    });

    expect(outcome).toEqual({
      kind: "closed",
      session: { id: sessionId, expected_cash: 5000, counted_cash: 4800, difference: -200 },
    });
    expect(movementsOf("CLOSING")).toEqual([{ amount: 4800, actor_id: "u9", authorized_by: null }]);
    expect(closedSessionRow()).toMatchObject({ state: "CLOSED", closed_by: "u9" });
    expect(JSON.parse(outboxRows()[0]?.payload ?? "")).toMatchObject({ closed_by: "u9" });
  });

  it("refuses the person who opened the session even when their PIN holds the permission, and leaves it open", async () => {
    addAuthorizer("u9", ["close_anothers_register_session", "sell_and_charge"]);
    const sessionId = await lockedWithSessionOf("u9");

    expect(
      await closeLockedCashSessionFor(deps(), { sessionId, countedCash: 5000, closer: CLOSER }),
    ).toEqual({ kind: "lacks_permission" });
    expect(movementsOf("CLOSING")).toEqual([]);
    expect(outboxRows()).toEqual([]);
    expect(closedSessionRow()).toMatchObject({ state: "OPEN" });
  });

  it("leaves nobody signed in after closing", async () => {
    addAuthorizer("u9", ["close_anothers_register_session"]);
    const sessionId = await lockedWithSessionOf("u1");

    await closeLockedCashSessionFor(deps(), { sessionId, countedCash: 5000, closer: CLOSER });

    expect(signedInPerson.userId()).toBeUndefined();
  });

  it("refuses a person without the permission, and leaves the session open", async () => {
    addAuthorizer("u9", ["sell_and_charge"]);
    const sessionId = await lockedWithSessionOf("u1");

    expect(
      await closeLockedCashSessionFor(deps(), { sessionId, countedCash: 5000, closer: CLOSER }),
    ).toEqual({ kind: "lacks_permission" });
    expect(movementsOf("CLOSING")).toEqual([]);
    expect(outboxRows()).toEqual([]);
    expect(closedSessionRow()).toMatchObject({ state: "OPEN" });
  });

  it("refuses a wrong PIN, and leaves the session open", async () => {
    addAuthorizer("u9", ["close_anothers_register_session"]);
    const sessionId = await lockedWithSessionOf("u1");

    const outcome = await closeLockedCashSessionFor(deps(), {
      sessionId,
      countedCash: 5000,
      closer: { user_id: "u9", pin: "0000" },
    });

    expect(outcome.kind).toBe("wrong_pin");
    expect(closedSessionRow()).toMatchObject({ state: "OPEN" });
  });

  it("refuses while someone is signed in, and leaves the session open", async () => {
    addAuthorizer("u9", ["close_anothers_register_session"]);
    const sessionId = await openAs("u1", 5000);

    expect(
      await closeLockedCashSessionFor(deps(), { sessionId, countedCash: 5000, closer: CLOSER }),
    ).toEqual({ kind: "not_locked" });
    expect(closedSessionRow()).toMatchObject({ state: "OPEN" });
  });

  it("answers no open session when none is open", async () => {
    addAuthorizer("u9", ["close_anothers_register_session"]);
    signedInPerson.clear();

    expect(
      await closeLockedCashSessionFor(deps(), {
        sessionId: "id-1",
        countedCash: 5000,
        closer: CLOSER,
      }),
    ).toEqual({ kind: "no_open_session" });
  });

  it("answers unavailable when the register holds no outbox chain key", async () => {
    addAuthorizer("u9", ["close_anothers_register_session"]);
    const sessionId = await lockedWithSessionOf("u1");

    expect(
      await closeLockedCashSessionFor(deps({ readOutboxChainKey: async () => undefined }), {
        sessionId,
        countedCash: 5000,
        closer: CLOSER,
      }),
    ).toEqual({ kind: "unavailable" });
  });
});

describe("identifying who closes a locked register", () => {
  const CLOSER = { user_id: "u9", pin: AUTHORIZER_PIN };

  it("identifies the person whose PIN holds the permission, without signing them in or closing anything", async () => {
    addAuthorizer("u9", ["close_anothers_register_session"]);
    await openAs("u1", 5000);
    signedInPerson.clear();

    expect(await identifyLockedCloserFor(deps(), CLOSER)).toEqual({
      kind: "identified",
      person: { user_id: "u9", first_name: "Grace" },
    });
    expect(signedInPerson.userId()).toBeUndefined();
    expect(closedSessionRow()).toMatchObject({ state: "OPEN" });
  });

  it("refuses the person who opened the session even when their PIN holds the permission", async () => {
    addAuthorizer("u9", ["close_anothers_register_session", "sell_and_charge"]);
    await openAs("u9", 5000);
    signedInPerson.clear();

    expect(await identifyLockedCloserFor(deps(), CLOSER)).toEqual({ kind: "lacks_permission" });
  });

  it("refuses a person without the permission", async () => {
    addAuthorizer("u9", ["sell_and_charge"]);
    signedInPerson.clear();

    expect(await identifyLockedCloserFor(deps(), CLOSER)).toEqual({ kind: "lacks_permission" });
  });

  it("refuses a wrong PIN", async () => {
    addAuthorizer("u9", ["close_anothers_register_session"]);
    signedInPerson.clear();

    const outcome = await identifyLockedCloserFor(deps(), { user_id: "u9", pin: "0000" });

    expect(outcome.kind).toBe("wrong_pin");
  });

  it("refuses while someone is signed in", async () => {
    addAuthorizer("u9", ["close_anothers_register_session"]);

    expect(await identifyLockedCloserFor(deps(), CLOSER)).toEqual({ kind: "not_locked" });
  });
});

describe("who may close a locked register", () => {
  it("is everyone holding the permission to close another's session but the person who opened it", async () => {
    addAuthorizer("u8", ["close_anothers_register_session", "sell_and_charge"]);
    addAuthorizer("u9", ["close_anothers_register_session"]);
    addAuthorizer("u7", ["sell_and_charge"]);
    for (const id of ["u7", "u8", "u9"]) {
      new SqliteSignInStore(database).remember(id);
    }
    await openAs("u8", 5000);

    expect(lockedClosersFor(database)).toEqual([{ id: "u9", first_name: "Grace" }]);
  });

  it("is nobody while no session is open", () => {
    addAuthorizer("u9", ["close_anothers_register_session"]);
    new SqliteSignInStore(database).remember("u9");

    expect(lockedClosersFor(database)).toEqual([]);
  });
});

describe("the cash balance of the open session", () => {
  it("is none while no session is open", () => {
    expect(cashBalanceFor(database)).toBeNull();
  });

  it("starts at the opening float", async () => {
    await openAs("u1", 5000);

    expect(cashBalanceFor(database)).toEqual({
      opening_float: 5000,
      cash_sales: 0,
      change_given: 0,
      refunds: 0,
      cash_in: 0,
      expenses: 0,
      withdrawals: 0,
      expected: 5000,
    });
  });

  it("adds what came in and takes away what went out, line by line", async () => {
    const sessionId = await openAs("u1", 5000);
    const ledger = new SqliteCashLedger(database, new SqliteSignInStore(database), CHAIN_KEY);
    const types = [
      ["SALE", 3000],
      ["CHANGE", 500],
      ["CASH_IN", 700],
      ["CASH_OUT", 200],
      ["WITHDRAWAL", 1000],
      ["REFUND", 300],
    ] as const;
    ledger.transaction((tx) => {
      for (const [type, amount] of types) {
        tx.recordCashMovement({
          id: `m-${type}`,
          sessionId,
          type,
          amount,
          actorId: "u1",
          occurredAt: NOW,
        });
      }
    });

    expect(cashBalanceFor(database)).toEqual({
      opening_float: 5000,
      cash_sales: 3000,
      change_given: 500,
      refunds: 300,
      cash_in: 700,
      expenses: 200,
      withdrawals: 1000,
      expected: 6700,
    });
  });
});

describe("the open sale of the session", () => {
  function addOpenSale(sessionId: string, lineTotal: number): void {
    database
      .prepare(
        "INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at) VALUES ('sale-1', 'register-1', 'device-1', ?, 'u1', 'OPEN', ?)",
      )
      .run(sessionId, NOW.toISOString());
    database
      .prepare(
        "INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total) VALUES ('line-1', 'sale-1', 1, 'p1', 'Yerba', 1, ?, 'pl-1', ?)",
      )
      .run(lineTotal, lineTotal);
  }

  function addApprovedPayment(): void {
    database
      .prepare(
        "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at) VALUES ('payment-1', 'sale-1', 'SALE', 'CASH', 'NONE', 1000, 'APPROVED', ?)",
      )
      .run(NOW.toISOString());
  }

  it("is none while no sale is open", async () => {
    await openAs("u1", 5000);

    expect(sessionOpenSaleFor(database)).toBeNull();
  });

  it("tells its total and that it can be cancelled while it has no approved payment", async () => {
    addOpenSale(await openAs("u1", 5000), 3500);

    expect(sessionOpenSaleFor(database)).toEqual({ total: 3500, cancellable: true });
  });

  it("tells that it cannot be cancelled once it has an approved payment", async () => {
    addOpenSale(await openAs("u1", 5000), 3500);
    addApprovedPayment();

    expect(sessionOpenSaleFor(database)).toEqual({ total: 3500, cancellable: false });
  });
});
