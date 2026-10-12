import { describe, expect, it } from "vitest";
import { recordInitialCountLine } from "./record-initial-count-line.js";
import {
  FakeInitialCountLedger,
  type FakeInitialCountState,
  SequentialIds,
} from "./test-support/fake-initial-count-ledger.js";
import { FixedClock } from "./test-support/fake-stock-store.js";
import { withdrawInitialCountLine } from "./withdraw-initial-count-line.js";

const COUNTED_AT = new Date("2026-10-07T09:30:00.000Z");
const WITHDRAWN_AT = new Date("2026-10-07T09:45:00.000Z");
const COUNTER = { isAdministrator: false, permissionKeys: ["record_initial_inventory"] };
const YERBA = { id: "yerba", name: "Yerba 1 kg", saleUnit: "UNIT" as const };

let ids = new SequentialIds();

function ledgerWithLine(state: Partial<FakeInitialCountState> = {}): FakeInitialCountLedger {
  ids = new SequentialIds();
  const store = new FakeInitialCountLedger({
    accesses: { counter: COUNTER },
    products: [YERBA],
    ...state,
  });
  recordInitialCountLine(
    { ledger: store, clock: new FixedClock(COUNTED_AT), ids },
    { actorId: "counter", productId: "yerba", counted: 6_000, expiresOn: "2027-01-31" },
  );
  return store;
}

function withdraw(store: FakeInitialCountLedger, movementId = "id-1", actorId = "counter") {
  return withdrawInitialCountLine(
    { ledger: store, clock: new FixedClock(WITHDRAWN_AT), ids },
    { actorId, movementId },
  );
}

describe("withdrawInitialCountLine", () => {
  it("records an opening count withdrawal movement taking back the line, referencing it", () => {
    const store = ledgerWithLine();

    const outcome = withdraw(store);

    expect(store.state.movements[1]).toEqual({
      id: "id-3",
      productId: "yerba",
      kind: "opening_count_withdrawal",
      delta: -6_000,
      occurredAt: WITHDRAWN_AT,
      expiresOn: null,
      withdrawsMovementId: "id-1",
    });
    expect(outcome).toEqual({ kind: "withdrawn" });
  });

  it("takes what the line added back out of the register's stock balance", () => {
    const store = ledgerWithLine({ balances: { yerba: 1_000 } });
    expect(store.state.balances["yerba"]).toBe(7_000);

    withdraw(store);

    expect(store.state.balances["yerba"]).toBe(1_000);
  });

  it("tells the cloud with an opening_count_withdrawn event", () => {
    const store = ledgerWithLine();

    withdraw(store);

    expect(store.state.outbox[1]).toEqual({
      event_id: "id-4",
      aggregate_type: "StockMovement",
      aggregate_id: "id-3",
      event_type: "opening_count_withdrawn",
      schema_version: 1,
      payload: { movement_id: "id-3", withdrawn_movement_id: "id-1" },
      occurred_at: WITHDRAWN_AT.toISOString(),
      actor_id: "counter",
    });
  });

  it("says not found for a movement that is no line of the initial count", () => {
    const store = ledgerWithLine();
    const before = structuredClone(store.state);

    expect(withdraw(store, "ghost")).toEqual({ kind: "not_found" });
    expect(store.state).toEqual(before);
  });

  it("says not found for the withdrawal itself", () => {
    const store = ledgerWithLine();
    withdraw(store);
    const before = structuredClone(store.state);

    expect(withdraw(store, "id-3")).toEqual({ kind: "not_found" });
    expect(store.state).toEqual(before);
  });

  it("changes nothing when the line was already withdrawn", () => {
    const store = ledgerWithLine();
    withdraw(store);
    const before = structuredClone(store.state);

    expect(withdraw(store)).toEqual({ kind: "already_withdrawn" });
    expect(store.state).toEqual(before);
  });

  it("refuses a person who may not record the initial inventory before reading anything else", () => {
    const store = ledgerWithLine({
      accesses: { counter: COUNTER, cashier: { isAdministrator: false, permissionKeys: [] } },
    });
    store.lookups.length = 0;
    const before = structuredClone(store.state);

    expect(withdraw(store, "id-1", "cashier")).toEqual({ kind: "not_permitted" });
    expect(store.lookups).toEqual(["actorAccess"]);
    expect(store.state).toEqual(before);
  });

  it.each([
    ["the branch's first cash session has opened", { branchFirstSessionOpened: true }],
    ["this register has opened a cash session", { ownSessionEverOpened: true }],
  ])("is no longer offered once %s", (_case, change) => {
    const store = ledgerWithLine();
    store.state = { ...store.state, ...change };
    const before = structuredClone(store.state);

    expect(withdraw(store)).toEqual({ kind: "not_offered" });
    expect(store.state).toEqual(before);
  });

  it("is unavailable while the register cannot keep a record to send", () => {
    const store = ledgerWithLine();
    store.state.outboxReady = false;
    const before = structuredClone(store.state);

    expect(withdraw(store)).toEqual({ kind: "unavailable" });
    expect(store.state).toEqual(before);
  });

  it.each(["recordInitialCountMovement", "addToStockBalance", "appendOutboxEvent"] as const)(
    "leaves nothing behind when %s fails",
    (write) => {
      const store = ledgerWithLine();
      const before = structuredClone(store.state);
      store.failingWrite = write;

      expect(() => withdraw(store)).toThrow(`${write} failed`);

      expect(store.state).toEqual(before);
    },
  );
});
