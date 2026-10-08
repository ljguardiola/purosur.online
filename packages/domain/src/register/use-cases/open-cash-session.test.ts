import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import type { CashSession, OpenedCashSession } from "../model/cash-session.js";
import { type OpenCashSessionGrant, openCashSession } from "./open-cash-session.js";
import {
  FakeCashLedger,
  type FakeCashLedgerState,
  type FakeCashLedgerWrite,
  SequentialIds,
} from "./test-support/fake-cash-ledger.js";
import {
  type FakeOperationAuthority,
  granting,
  refusing,
} from "./test-support/fake-operation-authority.js";
import { FixedClock } from "./test-support/fake-register-store.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const IDENTITY = { registerId: "register-1", deviceId: "device-1" };
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const EARLIER_SESSION: OpenedCashSession = {
  id: "earlier",
  registerId: "register-1",
  deviceId: "device-1",
  openedBy: "someone",
  openedAt: new Date("2026-09-30T08:00:00.000Z"),
  openingFloat: 1000,
  state: "OPEN",
};

function ledger(state: Partial<FakeCashLedgerState> = {}): FakeCashLedger {
  return new FakeCashLedger({ accesses: { cashier: CASHIER }, identity: IDENTITY, ...state });
}

const NOT_SIGNED_IN = { kind: "not_signed_in" } as const;

function open(
  store: FakeCashLedger,
  openerId = "cashier",
  openingFloat = 150000,
  authority: FakeOperationAuthority<OpenCashSessionGrant, typeof NOT_SIGNED_IN> = granting({
    openerId,
  }),
) {
  return openCashSession(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds(), authority },
    { openingFloat },
  );
}

function nothingRecorded(store: FakeCashLedger, before: FakeCashLedgerState): void {
  expect(store.state).toEqual(before);
}

describe("openCashSession", () => {
  it("opens the session with the opener, the moment and the float", async () => {
    const store = ledger();

    const outcome = await open(store);

    const session: OpenedCashSession = {
      id: "id-1",
      registerId: "register-1",
      deviceId: "device-1",
      openedBy: "cashier",
      openedAt: NOW,
      openingFloat: 150000,
      state: "OPEN",
    };
    expect(outcome).toEqual({ kind: "opened", session, grant: { openerId: "cashier" } });
    expect(store.state.sessions).toEqual([session]);
  });

  it("records the opening float as an OPENING cash movement of the opener", async () => {
    const store = ledger();

    await open(store);

    expect(store.state.movements).toEqual([
      {
        id: "id-2",
        sessionId: "id-1",
        type: "OPENING",
        amount: 150000,
        actorId: "cashier",
        occurredAt: NOW,
      },
    ]);
  });

  it("queues a cash_session_opened event for the session", async () => {
    const store = ledger();

    await open(store);

    expect(store.state.outbox).toEqual([
      {
        event_id: "id-3",
        aggregate_type: "CashSession",
        aggregate_id: "id-1",
        event_type: "cash_session_opened",
        schema_version: 1,
        payload: {
          opened_by: "cashier",
          opened_at: "2026-09-30T12:34:56.789Z",
          opening_float: 150000,
        },
        occurred_at: "2026-09-30T12:34:56.789Z",
        actor_id: "cashier",
      },
    ]);
  });

  it("does everything in one transaction", async () => {
    const store = ledger();

    await open(store);

    expect(store.transactions).toBe(1);
  });

  it.each([0, MAX_CASH_AMOUNT_CENTS])(
    "accepts an opening float of %i cents",
    async (openingFloat) => {
      expect((await open(ledger(), "cashier", openingFloat)).kind).toBe("opened");
    },
  );

  it("lets an Administrator open a session without holding the permission key", async () => {
    const store = ledger({ accesses: { boss: { isAdministrator: true, permissionKeys: [] } } });

    expect((await open(store, "boss")).kind).toBe("opened");
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_CASH_AMOUNT_CENTS + 1])(
    "refuses an opening float of %s without opening a transaction",
    async (openingFloat) => {
      const store = ledger();
      const before = structuredClone(store.state);

      const authority = granting({ openerId: "cashier" });

      expect(await open(store, "cashier", openingFloat, authority)).toEqual({
        kind: "invalid_opening_float",
      });
      expect(authority.asked).toBe(0);
      expect(store.transactions).toBe(0);
      nothingRecorded(store, before);
    },
  );

  it.each([
    ["an opener the register does not know", "stranger"],
    ["an opener without the permission to sell and charge", "viewer"],
  ])("refuses %s", async (_name, openerId) => {
    const store = ledger({
      accesses: { viewer: { isAdministrator: false, permissionKeys: ["void_sale"] } },
    });
    const before = structuredClone(store.state);

    expect(await open(store, openerId)).toEqual({ kind: "not_permitted" });
    nothingRecorded(store, before);
  });

  it("refuses when a session is already open", async () => {
    const store = ledger({ sessions: [EARLIER_SESSION] });
    const before = structuredClone(store.state);

    expect(await open(store)).toEqual({ kind: "already_open" });
    nothingRecorded(store, before);
  });

  it("opens a session when the earlier ones are closed", async () => {
    const closed: CashSession = {
      ...EARLIER_SESSION,
      state: "CLOSED",
      closedBy: "someone",
      closedAt: new Date("2026-09-30T11:00:00.000Z"),
      expectedCash: 1000,
      countedCash: 1000,
      difference: 0,
    };
    const store = ledger({ sessions: [closed] });

    expect((await open(store)).kind).toBe("opened");
  });

  it("refuses when the register has no identity yet", async () => {
    const store = ledger({ identity: undefined });
    const before = structuredClone(store.state);

    expect(await open(store)).toEqual({ kind: "unavailable" });
    nothingRecorded(store, before);
  });

  it("answers the authority's refusal and records nothing when the opening is not authorized", async () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(await open(store, "cashier", 150000, refusing(NOT_SIGNED_IN))).toEqual(NOT_SIGNED_IN);
    expect(store.transactions).toBe(0);
    nothingRecorded(store, before);
  });

  it("asks for the authorization once", async () => {
    const authority = granting({ openerId: "cashier" });

    await open(ledger(), "cashier", 150000, authority);

    expect(authority.asked).toBe(1);
  });

  it("checks the opener's permission before whether a session is already open", async () => {
    const store = ledger({ sessions: [EARLIER_SESSION] });

    expect(await open(store, "stranger")).toEqual({ kind: "not_permitted" });
  });

  it("checks whether a session is already open before the register's identity", async () => {
    const store = ledger({ sessions: [EARLIER_SESSION], identity: undefined });

    expect(await open(store)).toEqual({ kind: "already_open" });
  });

  it("checks the opening float before the opener's permission", async () => {
    expect(await open(ledger(), "stranger", -1)).toEqual({ kind: "invalid_opening_float" });
  });

  it.each<FakeCashLedgerWrite>(["recordOpenedSession", "recordCashMovement", "appendOutboxEvent"])(
    "leaves nothing behind when %s fails",
    async (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      await expect(open(store)).rejects.toThrow(`${write} failed`);
      nothingRecorded(store, before);
    },
  );
});
