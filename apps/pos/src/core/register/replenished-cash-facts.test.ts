import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { cashBalanceFor } from "./cash-session-requests";
import { applyReplenishedCashFact } from "./replenished-cash-facts";

type CashFact = Extract<
  SyncedFact,
  { kind: "cash_session_opened" | "cash_session_closed" | "cash_movement_recorded" }
>;

const SOURCE = { eventId: "event-1", deviceId: "device-old" };
const OPENED_AT = new Date("2026-10-05T08:00:00.000Z");
const CLOSED_AT = new Date("2026-10-05T20:00:00.000Z");

let database: LocalDatabase;
let generated = 0;
const ids = { next: () => `generated-${++generated}` };

function apply(fact: CashFact): void {
  applyReplenishedCashFact(database, fact, SOURCE, ids);
}

function opened(overrides: Partial<{ id: string; openedBy: string; openingFloat: number }> = {}) {
  return {
    kind: "cash_session_opened",
    session: {
      id: "session-1",
      openedBy: "user-1",
      openedAt: OPENED_AT,
      openingFloat: 5000,
      ...overrides,
    },
  } satisfies CashFact;
}

function closed(overrides: Partial<{ id: string; countedCash: number }> = {}) {
  return {
    kind: "cash_session_closed",
    session: {
      id: "session-1",
      closedBy: "user-2",
      closedAt: CLOSED_AT,
      expectedCash: 7000,
      countedCash: 6900,
      difference: -100,
      ...overrides,
    },
  } satisfies CashFact;
}

function movement(
  overrides: Partial<Extract<CashFact, { kind: "cash_movement_recorded" }>["movement"]> = {},
) {
  return {
    kind: "cash_movement_recorded",
    movement: {
      sessionId: "session-1",
      type: "CASH_IN",
      amount: 1000,
      reason: "float top-up",
      refType: null,
      refId: null,
      actorId: "user-1",
      authorizedBy: null,
      occurredAt: new Date("2026-10-05T10:00:00.000Z"),
      ...overrides,
    },
  } satisfies CashFact;
}

function sessions() {
  return database.prepare("SELECT * FROM cash_sessions ORDER BY id").all();
}

function movements() {
  return database
    .prepare(
      `SELECT id, session_id, type, amount, reason, ref_type, ref_id, actor_id, authorized_by, occurred_at
         FROM cash_movements ORDER BY rowid`,
    )
    .all();
}

beforeEach(() => {
  generated = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version, removed) VALUES ('register-new', 'Caja 1', 1, 0);
     UPDATE sync_state SET device_id = 'device-new';`,
  );
});

afterEach(() => {
  database.close();
});

describe("replenishing the cash session facts of a restored register", () => {
  describe("an opened session", () => {
    it("is held as an open session of the register, opened by the installation that produced the event", () => {
      apply(opened());

      expect(sessions()).toEqual([
        {
          id: "session-1",
          register_id: "register-new",
          device_id: "device-old",
          opened_by: "user-1",
          opened_at: "2026-10-05T08:00:00.000Z",
          opening_float: 5000,
          closed_by: null,
          closed_at: null,
          expected_cash: null,
          counted_cash: null,
          difference: null,
          state: "OPEN",
        },
      ]);
    });

    it("holds its opening float as the session's first cash movement", () => {
      apply(opened());

      expect(movements()).toEqual([
        {
          id: "generated-1",
          session_id: "session-1",
          type: "OPENING",
          amount: 5000,
          reason: null,
          ref_type: null,
          ref_id: null,
          actor_id: "user-1",
          authorized_by: null,
          occurred_at: "2026-10-05T08:00:00.000Z",
        },
      ]);
    });

    it("changes nothing when the snapshot already holds the session", () => {
      apply(opened());
      const before = { sessions: sessions(), movements: movements() };

      apply(opened());

      expect({ sessions: sessions(), movements: movements() }).toEqual(before);
    });

    it("is refused when the register has no installation identity yet", () => {
      database.exec("UPDATE sync_state SET device_id = NULL");

      expect(() => apply(opened())).toThrow("the register has no identity");
    });
  });

  describe("a closed session", () => {
    it("closes the session the snapshot still holds open, with what the cashier counted", () => {
      apply(opened());

      apply(closed());

      expect(sessions()).toMatchObject([
        {
          id: "session-1",
          state: "CLOSED",
          closed_by: "user-2",
          closed_at: "2026-10-05T20:00:00.000Z",
          expected_cash: 7000,
          counted_cash: 6900,
          difference: -100,
        },
      ]);
    });

    it("holds the counted cash as the session's closing cash movement", () => {
      apply(opened());

      apply(closed());

      expect(movements().at(-1)).toEqual({
        id: "generated-2",
        session_id: "session-1",
        type: "CLOSING",
        amount: 6900,
        reason: null,
        ref_type: null,
        ref_id: null,
        actor_id: "user-2",
        authorized_by: null,
        occurred_at: "2026-10-05T20:00:00.000Z",
      });
    });

    it("changes nothing when the snapshot already holds the session closed", () => {
      apply(opened());
      apply(closed());
      const before = { sessions: sessions(), movements: movements() };

      apply(closed({ countedCash: 1 }));

      expect({ sessions: sessions(), movements: movements() }).toEqual(before);
    });

    it("is refused for a session the register does not hold", () => {
      expect(() => apply(closed())).toThrow("cash session session-1 is not held");
    });
  });

  describe("a recorded cash movement", () => {
    beforeEach(() => {
      apply(opened());
    });

    it("is held in its session with what the cashier recorded", () => {
      apply(movement({ type: "WITHDRAWAL", amount: 2000, authorizedBy: "user-2" }));

      expect(movements().at(-1)).toEqual({
        id: "generated-2",
        session_id: "session-1",
        type: "WITHDRAWAL",
        amount: 2000,
        reason: "float top-up",
        ref_type: null,
        ref_id: null,
        actor_id: "user-1",
        authorized_by: "user-2",
        occurred_at: "2026-10-05T10:00:00.000Z",
      });
    });

    it("keeps what the movement refers to", () => {
      apply(movement({ refType: "sale", refId: "sale-9" }));

      expect(movements().at(-1)).toMatchObject({ ref_type: "sale", ref_id: "sale-9" });
    });

    it("changes nothing when the snapshot already holds the same movement", () => {
      apply(movement());
      const before = movements();

      apply(movement());

      expect(movements()).toEqual(before);
    });

    it("holds two movements of the same amount made at different moments", () => {
      apply(movement());
      apply(movement({ occurredAt: new Date("2026-10-05T10:00:01.000Z") }));

      expect(movements().filter(({ type }) => (type as string) === "CASH_IN")).toHaveLength(2);
    });

    it("holds two movements of the same moment made by different people", () => {
      apply(movement());
      apply(movement({ actorId: "user-2" }));

      expect(movements().filter(({ type }) => (type as string) === "CASH_IN")).toHaveLength(2);
    });
  });

  it("makes the cash the open session expects include the replenished movements", () => {
    apply(opened());
    apply(movement({ type: "CASH_IN", amount: 1000 }));
    apply(
      movement({ type: "CASH_OUT", amount: 300, occurredAt: new Date("2026-10-05T11:00:00.000Z") }),
    );

    expect(cashBalanceFor(database)?.expected).toBe(5700);
  });
});
