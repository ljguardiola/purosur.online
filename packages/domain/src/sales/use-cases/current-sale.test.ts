import { describe, expect, it } from "vitest";
import type { SaleWithLines } from "../model/sale.js";
import { currentSale } from "./current-sale.js";
import { FakeSaleLedger, type FakeSaleLedgerState } from "./test-support/fake-sale-ledger.js";

const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  occurredAt: new Date("2026-09-30T12:00:00.000Z"),
  lines: [
    {
      id: "line-1",
      productId: "yerba",
      productName: "Yerba 1 kg",
      quantity: 2,
      listUnitPrice: 2500,
      priceListId: "list-1",
      lineTotal: 5000,
    },
  ],
};

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    session: SESSION,
    sales: [SALE],
    ...state,
  });
}

function read(store: FakeSaleLedger, actorId = "cashier") {
  return currentSale({ ledger: store }, { actorId });
}

describe("currentSale", () => {
  it("returns the open sale of the current session with its lines", () => {
    expect(read(ledger())).toEqual({ kind: "open", sale: SALE });
  });

  it("reports that there is no sale when none is open in the session", () => {
    const completed: SaleWithLines = { ...SALE, state: "COMPLETED" };
    const elsewhere: SaleWithLines = { ...SALE, sessionId: "session-0" };

    expect(read(ledger({ sales: [completed, elsewhere] }))).toEqual({ kind: "no_sale" });
  });

  it("refuses without an open cash session", () => {
    expect(read(ledger({ session: undefined }))).toEqual({ kind: "no_open_session" });
  });

  it.each([
    ["an actor the register does not know", "stranger"],
    ["an actor without the permission to sell and charge", "viewer"],
  ])("refuses %s", (_name, actorId) => {
    const store = ledger({
      accesses: { cashier: CASHIER, viewer: { isAdministrator: false, permissionKeys: [] } },
    });

    expect(read(store, actorId)).toEqual({ kind: "not_permitted" });
  });

  it("refuses an actor who did not open the current session", () => {
    const store = ledger({ accesses: { cashier: CASHIER, other: CASHIER } });

    expect(read(store, "other")).toEqual({ kind: "not_permitted" });
  });

  it("checks the permission before whether a session is open", () => {
    expect(read(ledger({ session: undefined }), "stranger")).toEqual({ kind: "not_permitted" });
  });

  it("changes nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    read(store);

    expect(store.state).toEqual(before);
  });
});
