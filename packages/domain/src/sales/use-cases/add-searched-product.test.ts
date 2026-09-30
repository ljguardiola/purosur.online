import { describe, expect, it } from "vitest";
import type { SaleWithLines } from "../model/sale.js";
import { addSearchedProduct } from "./add-searched-product.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const YERBA = { id: "yerba", name: "Yerba 1 kg", saleUnit: "UNIT" as const };
const QUESO = { id: "queso", name: "Queso cremoso", saleUnit: "KG" as const };
const FIDEOS = { id: "fideos", name: "Fideos", saleUnit: "UNIT" as const };

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    products: [YERBA, QUESO, FIDEOS],
    prices: [
      { productId: "yerba", priceListId: "list-1", unitPrice: 2500, validFrom: LONG_AGO },
      { productId: "queso", priceListId: "list-1", unitPrice: 9000, validFrom: LONG_AGO },
    ],
    ...state,
  });
}

function add(store: FakeSaleLedger, productId = "yerba", actorId = "cashier") {
  return addSearchedProduct(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds() },
    { actorId, productId },
  );
}

describe("addSearchedProduct", () => {
  it("opens a sale with a line for the product at its current list price", () => {
    const store = ledger();

    const outcome = add(store);

    const sale: SaleWithLines = {
      id: "id-1",
      registerId: "register-1",
      deviceId: "device-1",
      sessionId: "session-1",
      actorId: "cashier",
      state: "OPEN",
      occurredAt: NOW,
      lines: [
        {
          id: "id-2",
          productId: "yerba",
          productName: "Yerba 1 kg",
          quantity: 1,
          listUnitPrice: 2500,
          priceListId: "list-1",
          lineTotal: 2500,
        },
      ],
    };
    expect(outcome).toEqual({ kind: "added", sale });
    expect(store.state.sales).toEqual([sale]);
  });

  it("adds a unit to the line when the product is already in the sale", () => {
    const store = ledger();
    add(store);

    const outcome = add(store);

    expect(outcome.kind === "added" && outcome.sale.lines).toEqual([
      expect.objectContaining({ quantity: 2, lineTotal: 5000 }),
    ]);
  });

  it("refuses a product that is not sold any more, changing nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(add(store, "discontinued")).toEqual({ kind: "product_unavailable" });
    expect(store.state).toEqual(before);
  });

  it("refuses a product without a valid price, naming it", () => {
    expect(add(ledger(), "fideos")).toEqual({ kind: "no_price", productName: "Fideos" });
  });

  it("refuses a product sold by weight, naming it", () => {
    expect(add(ledger(), "queso")).toEqual({
      kind: "sold_by_weight",
      productName: "Queso cremoso",
    });
  });

  it("refuses to open a sale when the installation was revoked", () => {
    expect(add(ledger({ revoked: true }))).toEqual({ kind: "installation_revoked" });
  });

  it("refuses to open a sale when the register has no identity yet", () => {
    expect(add(ledger({ identity: undefined }))).toEqual({ kind: "unavailable" });
  });

  it("refuses an actor without the permission to sell and charge", () => {
    expect(add(ledger(), "yerba", "stranger")).toEqual({ kind: "not_permitted" });
  });

  it("refuses without an open cash session", () => {
    expect(add(ledger({ session: undefined }))).toEqual({ kind: "no_open_session" });
  });
});
