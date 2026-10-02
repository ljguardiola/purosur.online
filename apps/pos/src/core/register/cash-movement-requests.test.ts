import { encodePinHash } from "@purosur/contracts";
import { CASH_MOVEMENT_REASON_MAX_LENGTH } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createActionGate } from "../access/action-gate";
import { derivePinVerifier } from "../access/pin-verifier";
import { createSignedInPerson, type SignedInPerson } from "../access/signed-in-person";
import { SqliteSignInStore } from "../access/sqlite-sign-in-store";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import {
  type CashMovementRequest,
  cashMovementKindsFor,
  currentCashMovements,
  recordCashMovementFor,
} from "./cash-movement-requests";
import { type CashSessionRequestDeps, openCashSessionFor } from "./cash-session-requests";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const SALT = encodePinHash(new Uint8Array(16).fill(1));
const PIN_HASH = "hash-of-the-right-pin";
const NOW = new Date("2026-09-30T12:00:00.000Z");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let idCount: number;

function deps(
  overrides: Partial<CashSessionRequestDeps> = {},
): CashSessionRequestDeps & { signedInPerson: SignedInPerson } {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async (pin) => (pin === "1234" ? PIN_HASH : "hash-of-another-pin"),
      now: () => NOW,
    }),
    signedInPerson,
    readOutboxChainKey: async () => CHAIN_KEY,
    now: () => NOW,
    ids: {
      next: () => {
        idCount += 1;
        return `id-${idCount}`;
      },
    },
    ...overrides,
  };
}

function addRole(id: string, permissions: string[]): void {
  database
    .prepare("INSERT INTO roles (id, name, is_administrator, version) VALUES (?, ?, 0, 1)")
    .run(id, id);
  for (const key of permissions) {
    database
      .prepare("INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, ?, 1)")
      .run(id, key);
  }
}

function addPerson(id: string, roleId: string, firstName: string): void {
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, ?, ?, ?, 1, 1)",
    )
    .run(id, firstName, roleId, SALT);
  database
    .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
    .run(id, derivePinVerifier(PEPPER, PIN_HASH));
}

function request(overrides: Partial<CashMovementRequest> = {}): CashMovementRequest {
  return {
    kind: "CASH_IN",
    amount: 2500,
    reason: " Cambio ",
    authorization: undefined,
    ...overrides,
  };
}

function movementRows(): unknown[] {
  return database
    .prepare(
      "SELECT type, amount, reason, actor_id, authorized_by FROM cash_movements WHERE type != 'OPENING'",
    )
    .all();
}

function outboxPayloads(): unknown[] {
  return database
    .prepare<[], { payload: string }>(
      "SELECT payload FROM outbox WHERE event_type = 'cash_movement_recorded'",
    )
    .all()
    .map((row) => JSON.parse(row.payload));
}

beforeEach(async () => {
  idCount = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  addRole("clerk", ["sell_and_charge", "record_cash_in"]);
  addRole("manager", ["sell_and_charge", "record_cash_in", "record_cash_expense", "withdraw_cash"]);
  addPerson("u1", "clerk", "Ada");
  addPerson("u2", "manager", "Grace");
  database
    .prepare("INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1)")
    .run();
  database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
  await openCashSessionFor(deps(), 5000);
});

afterEach(() => {
  database.close();
});

describe("recording a cash movement", () => {
  it("records cash brought in by a person holding that permission, with nobody authorizing it", async () => {
    expect(await recordCashMovementFor(deps(), request())).toEqual({
      kind: "recorded",
      authorized_by: null,
    });
    expect(movementRows()).toEqual([
      { type: "CASH_IN", amount: 2500, reason: "Cambio", actor_id: "u1", authorized_by: null },
    ]);
  });

  it("writes the outbox event in the same transaction as the movement", async () => {
    await recordCashMovementFor(deps(), request());

    expect(outboxPayloads()).toEqual([
      {
        type: "CASH_IN",
        amount: 2500,
        reason: "Cambio",
        ref_type: null,
        ref_id: null,
        actor_id: "u1",
        authorized_by: null,
        occurred_at: "2026-09-30T12:00:00.000Z",
      },
    ]);
  });

  it("writes neither the movement nor its event when the outbox cannot take the event", async () => {
    database.exec(
      "CREATE TRIGGER refuse_events BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );

    await expect(recordCashMovementFor(deps(), request())).rejects.toThrow();
    expect(movementRows()).toEqual([]);
  });

  it.each(["CASH_OUT", "WITHDRAWAL"] as const)(
    "refuses %s to a person without its permission, and writes nothing",
    async (kind) => {
      expect(await recordCashMovementFor(deps(), request({ kind }))).toEqual({
        kind: "lacks_permission",
      });
      expect(movementRows()).toEqual([]);
      expect(outboxPayloads()).toEqual([]);
    },
  );

  it.each([["CASH_OUT"], ["WITHDRAWAL"]] as const)(
    "records %s with the PIN of a person who holds its permission, naming who authorized it",
    async (kind) => {
      const outcome = await recordCashMovementFor(
        deps(),
        request({ kind, authorization: { user_id: "u2", pin: "1234" } }),
      );

      expect(outcome).toEqual({
        kind: "recorded",
        authorized_by: { user_id: "u2", first_name: "Grace" },
      });
      expect(movementRows()).toEqual([
        { type: kind, amount: 2500, reason: "Cambio", actor_id: "u1", authorized_by: "u2" },
      ]);
      expect(outboxPayloads()).toEqual([
        expect.objectContaining({ type: kind, actor_id: "u1", authorized_by: "u2" }),
      ]);
    },
  );

  it("refuses a wrong PIN, and writes nothing", async () => {
    const outcome = await recordCashMovementFor(
      deps(),
      request({ kind: "CASH_OUT", authorization: { user_id: "u2", pin: "0000" } }),
    );

    expect(outcome.kind).toBe("wrong_pin");
    expect(movementRows()).toEqual([]);
  });

  it("refuses the PIN of a person who lacks the permission, and writes nothing", async () => {
    addPerson("u3", "clerk", "Bruno");

    const outcome = await recordCashMovementFor(
      deps(),
      request({ kind: "WITHDRAWAL", authorization: { user_id: "u3", pin: "1234" } }),
    );

    expect(outcome).toEqual({ kind: "lacks_permission" });
    expect(movementRows()).toEqual([]);
  });

  it("refuses while nobody is signed in, and writes nothing", async () => {
    signedInPerson.clear();

    expect(await recordCashMovementFor(deps(), request())).toEqual({ kind: "not_signed_in" });
    expect(movementRows()).toEqual([]);
  });

  it("answers that no session is open, and writes nothing", async () => {
    database
      .prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = ?")
      .run(NOW.toISOString());

    expect(await recordCashMovementFor(deps(), request())).toEqual({ kind: "no_open_session" });
    expect(movementRows()).toEqual([]);
    expect(outboxPayloads()).toEqual([]);
  });

  it.each([
    ["an amount that is not positive", { amount: 0 }, { kind: "invalid_amount" }],
    [
      "a reason that is blank",
      { reason: "  " },
      { kind: "invalid_reason", max_length: CASH_MOVEMENT_REASON_MAX_LENGTH },
    ],
  ] as const)("answers the domain's refusal of %s", async (_case, overrides, outcome) => {
    expect(await recordCashMovementFor(deps(), request(overrides))).toEqual(outcome);
    expect(movementRows()).toEqual([]);
  });

  it("refuses an amount it cannot record before checking the authorizer's PIN, spending none of its attempts", async () => {
    const outcome = await recordCashMovementFor(
      deps(),
      request({ kind: "CASH_OUT", amount: 0, authorization: { user_id: "u2", pin: "0000" } }),
    );

    expect(outcome).toEqual({ kind: "invalid_amount" });
    expect(database.prepare("SELECT user_id FROM pin_sign_in_failures").all()).toEqual([]);
  });

  it("refuses an amount it cannot record before telling that nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await recordCashMovementFor(deps(), request({ amount: 0 }))).toEqual({
      kind: "invalid_amount",
    });
  });

  it("refuses a withdrawal above the session's expected cash, saying how much is expected, and writes nothing", async () => {
    const outcome = await recordCashMovementFor(
      deps(),
      request({ kind: "WITHDRAWAL", amount: 5001, authorization: { user_id: "u2", pin: "1234" } }),
    );

    expect(outcome).toEqual({ kind: "exceeds_expected_cash", expected: 5000 });
    expect(movementRows()).toEqual([]);
    expect(outboxPayloads()).toEqual([]);
  });

  it("records a withdrawal equal to the session's expected cash", async () => {
    const outcome = await recordCashMovementFor(
      deps(),
      request({ kind: "WITHDRAWAL", amount: 5000, authorization: { user_id: "u2", pin: "1234" } }),
    );

    expect(outcome.kind).toBe("recorded");
    expect(movementRows()).toEqual([
      { type: "WITHDRAWAL", amount: 5000, reason: "Cambio", actor_id: "u1", authorized_by: "u2" },
    ]);
  });

  it("answers unavailable, writing nothing, when the register holds no outbox chain key", async () => {
    expect(
      await recordCashMovementFor(deps({ readOutboxChainKey: async () => undefined }), request()),
    ).toEqual({ kind: "unavailable" });
    expect(movementRows()).toEqual([]);
  });
});

describe("the open session's cash movements", () => {
  it("lists what was recorded, with the names of who did it and who authorized it", async () => {
    await recordCashMovementFor(
      deps(),
      request({ kind: "WITHDRAWAL", authorization: { user_id: "u2", pin: "1234" } }),
    );

    expect(currentCashMovements(database)).toEqual([
      expect.objectContaining({ type: "OPENING", amount: 5000, authorized_by: null }),
      {
        id: expect.any(String),
        type: "WITHDRAWAL",
        amount: 2500,
        reason: "Cambio",
        direction: "out",
        occurred_at: "2026-09-30T09:00:00.000-03:00",
        actor: { user_id: "u1", first_name: "Ada" },
        authorized_by: { user_id: "u2", first_name: "Grace" },
      },
    ]);
  });

  it("is none while no session is open", () => {
    database
      .prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = ?")
      .run(NOW.toISOString());

    expect(currentCashMovements(database)).toBeNull();
  });
});

describe("the cash movements the person signed in can record", () => {
  it("names the permission each kind needs and asks for no authorizer when it is held", () => {
    signedInPerson.set("u2");

    expect(cashMovementKindsFor(deps())).toEqual({
      CASH_IN: { permission: "record_cash_in", authorization_required: false },
      CASH_OUT: { permission: "record_cash_expense", authorization_required: false },
      WITHDRAWAL: { permission: "withdraw_cash", authorization_required: false },
    });
  });

  it("asks for an authorizer for each kind whose permission is not held", () => {
    expect(cashMovementKindsFor(deps())).toEqual({
      CASH_IN: { permission: "record_cash_in", authorization_required: false },
      CASH_OUT: { permission: "record_cash_expense", authorization_required: true },
      WITHDRAWAL: { permission: "withdraw_cash", authorization_required: true },
    });
  });

  it("asks for no authorizer from an administrator", () => {
    database.prepare("UPDATE roles SET is_administrator = 1 WHERE id = 'clerk'").run();

    expect(cashMovementKindsFor(deps())).toEqual({
      CASH_IN: { permission: "record_cash_in", authorization_required: false },
      CASH_OUT: { permission: "record_cash_expense", authorization_required: false },
      WITHDRAWAL: { permission: "withdraw_cash", authorization_required: false },
    });
  });

  it("is none when nobody is signed in", () => {
    signedInPerson.clear();

    expect(cashMovementKindsFor(deps())).toBeNull();
  });

  it("is none when the person signed in is no longer active", () => {
    database.prepare("UPDATE users SET active = 0 WHERE id = 'u1'").run();

    expect(cashMovementKindsFor(deps())).toBeNull();
  });
});
