import { describe, expect, it } from "vitest";
import { MAX_STOCK_QUANTITY } from "../model/stock-quantity.js";
import {
  type RecordInitialCountLineInput,
  recordInitialCountLine,
} from "./record-initial-count-line.js";
import {
  FakeInitialCountLedger,
  type FakeInitialCountState,
  SequentialIds,
} from "./test-support/fake-initial-count-ledger.js";
import { FixedClock } from "./test-support/fake-stock-store.js";

const NOW = new Date("2026-10-07T09:30:00.000Z");
const COUNTER = { isAdministrator: false, permissionKeys: ["record_initial_inventory"] };
const YERBA = { id: "yerba", name: "Yerba 1 kg", saleUnit: "UNIT" as const };
const QUESO = { id: "queso", name: "Queso cremoso", saleUnit: "KG" as const };

function ledger(state: Partial<FakeInitialCountState> = {}): FakeInitialCountLedger {
  return new FakeInitialCountLedger({
    accesses: { counter: COUNTER },
    products: [YERBA, QUESO],
    ...state,
  });
}

function record(
  store: FakeInitialCountLedger,
  overrides: Partial<RecordInitialCountLineInput> = {},
  actorId = "counter",
) {
  return recordInitialCountLine(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds() },
    { actorId, productId: "yerba", counted: 6_000, expiresOn: "2027-01-31", ...overrides },
  );
}

describe("recordInitialCountLine", () => {
  it("records the line as an opening count movement dated now, carrying its expiry", () => {
    const store = ledger();

    const outcome = record(store);

    expect(store.state.movements).toEqual([
      {
        id: "id-1",
        productId: "yerba",
        kind: "opening_count",
        delta: 6_000,
        occurredAt: NOW,
        expiresOn: "2027-01-31",
        withdrawsMovementId: null,
      },
    ]);
    expect(outcome).toEqual({
      kind: "recorded",
      line: {
        movementId: "id-1",
        productId: "yerba",
        productName: "Yerba 1 kg",
        saleUnit: "UNIT",
        counted: 6_000,
        expiresOn: "2027-01-31",
      },
    });
  });

  it("adds what was counted to the register's stock balance", () => {
    const store = ledger({ balances: { yerba: 1_000 } });

    record(store);
    record(store, { productId: "queso", counted: 2_345, expiresOn: null });

    expect(store.state.balances).toEqual({ yerba: 7_000, queso: 2_345 });
  });

  it("tells the cloud with an opening_count_recorded event about the movement, never deciding a cost or a lot", () => {
    const store = ledger();

    record(store);

    expect(store.state.outbox).toEqual([
      {
        event_id: "id-2",
        aggregate_type: "StockMovement",
        aggregate_id: "id-1",
        event_type: "opening_count_recorded",
        schema_version: 1,
        payload: {
          movement_id: "id-1",
          product_id: "yerba",
          counted: 6_000,
          expires_on: "2027-01-31",
        },
        occurred_at: NOW.toISOString(),
        actor_id: "counter",
      },
    ]);
  });

  it("keeps a product without an expiry as a line with none", () => {
    const store = ledger();

    record(store, { expiresOn: null });

    expect(store.state.movements[0]).toMatchObject({ expiresOn: null });
    expect(store.state.outbox[0]?.payload).toMatchObject({ expires_on: null });
  });

  it("records the same product counted with different expiry dates as separate lines", () => {
    const store = ledger();
    const ids = new SequentialIds();
    const ports = { ledger: store, clock: new FixedClock(NOW), ids };

    recordInitialCountLine(ports, {
      actorId: "counter",
      productId: "yerba",
      counted: 6_000,
      expiresOn: "2027-01-31",
    });
    recordInitialCountLine(ports, {
      actorId: "counter",
      productId: "yerba",
      counted: 4_000,
      expiresOn: "2027-06-30",
    });

    expect(
      store.state.movements.map(({ id, delta, expiresOn }) => ({ id, delta, expiresOn })),
    ).toEqual([
      { id: "id-1", delta: 6_000, expiresOn: "2027-01-31" },
      { id: "id-3", delta: 4_000, expiresOn: "2027-06-30" },
    ]);
    expect(store.state.outbox.map((event) => event.aggregate_id)).toEqual(["id-1", "id-3"]);
    expect(store.state.balances["yerba"]).toBe(10_000);
  });

  it("accepts a fraction of a kilo for a product sold by weight", () => {
    const store = ledger();

    const outcome = record(store, { productId: "queso", counted: 1_250, expiresOn: null });

    expect(outcome).toMatchObject({ kind: "recorded", line: { counted: 1_250, saleUnit: "KG" } });
  });

  it("permits an Administrator", () => {
    const store = ledger({ accesses: { boss: { isAdministrator: true, permissionKeys: [] } } });

    expect(record(store, {}, "boss")).toMatchObject({ kind: "recorded" });
  });

  it.each([
    ["a cashier who only sells", { isAdministrator: false, permissionKeys: ["sell_and_charge"] }],
    ["a person with no role", undefined],
  ])("refuses %s before reading anything else", (_who, access) => {
    const store = ledger({ accesses: access ? { counter: access } : {} });

    const outcome = record(store);

    expect(outcome).toEqual({ kind: "not_permitted" });
    expect(store.lookups).toEqual(["actorAccess"]);
    expect(store.state.movements).toEqual([]);
    expect(store.state.outbox).toEqual([]);
  });

  it.each([
    ["the branch's first cash session has opened", { branchFirstSessionOpened: true }],
    ["this register has opened a cash session", { ownSessionEverOpened: true }],
  ])("is no longer offered once %s, writing nothing", (_case, state) => {
    const store = ledger(state);

    const outcome = record(store);

    expect(outcome).toEqual({ kind: "not_offered" });
    expect(store.state.movements).toEqual([]);
    expect(store.state.balances).toEqual({});
    expect(store.state.outbox).toEqual([]);
  });

  it("is unavailable while the register cannot keep a record to send, writing nothing", () => {
    const store = ledger({ outboxReady: false });

    expect(record(store)).toEqual({ kind: "unavailable" });
    expect(store.state.movements).toEqual([]);
  });

  it("refuses a product that does not exist", () => {
    const store = ledger();

    expect(record(store, { productId: "ghost" })).toEqual({ kind: "unknown_product" });
    expect(store.state.movements).toEqual([]);
  });

  it.each([
    ["zero", "yerba", 0],
    ["negative", "yerba", -1_000],
    ["a fraction of a unit for a product sold by the unit", "yerba", 1_500],
    ["above the largest quantity", "queso", MAX_STOCK_QUANTITY + 1],
    ["not a whole number of thousandths", "queso", 1.5],
  ])("refuses a quantity that is %s, writing nothing", (_case, productId, counted) => {
    const store = ledger();

    expect(record(store, { productId, counted })).toEqual({ kind: "invalid_quantity" });
    expect(store.state.movements).toEqual([]);
    expect(store.state.balances).toEqual({});
    expect(store.state.outbox).toEqual([]);
  });

  it.each(["2027-02-30", "soon", "2027-01-31T00:00:00.000Z", ""])(
    "refuses the expiry %j, writing nothing",
    (expiresOn) => {
      const store = ledger();

      expect(record(store, { expiresOn })).toEqual({ kind: "invalid_expiry" });
      expect(store.state.movements).toEqual([]);
    },
  );

  it.each(["recordInitialCountMovement", "addToStockBalance", "appendOutboxEvent"] as const)(
    "leaves nothing behind when %s fails",
    (write) => {
      const store = ledger();
      store.failingWrite = write;

      expect(() => record(store)).toThrow(`${write} failed`);

      expect(store.state.movements).toEqual([]);
      expect(store.state.balances).toEqual({});
      expect(store.state.outbox).toEqual([]);
    },
  );
});
