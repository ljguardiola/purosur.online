import { describe, expect, it } from "vitest";
import type { SaleWithLines } from "../model/sale.js";
import { searchProductsByName } from "./search-products-by-name.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const YERBA = { id: "yerba", name: "Yerba de mate", saleUnit: "UNIT" as const };
const QUESO = { id: "queso", name: "Queso de cabra", saleUnit: "KG" as const };

function completedSaleOf(productId: string, registerId = "register-1"): SaleWithLines {
  return {
    id: `sale-${productId}-${registerId}`,
    registerId,
    deviceId: "device-1",
    sessionId: "session-0",
    actorId: "cashier",
    state: "COMPLETED",
    occurredAt: LONG_AGO,
    lines: [
      {
        id: `line-${productId}`,
        productId,
        productName: productId,
        quantity: 1,
        listUnitPrice: 100,
        priceListId: "list-1",
        lineTotal: 100,
      },
    ],
  };
}

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    products: [YERBA, QUESO],
    prices: [
      { productId: "yerba", priceListId: "list-1", unitPrice: 2500, validFrom: LONG_AGO },
      { productId: "queso", priceListId: "list-1", unitPrice: 9000, validFrom: LONG_AGO },
    ],
    ...state,
  });
}

function search(store: FakeSaleLedger, query: string, actorId = "cashier") {
  return searchProductsByName({ ledger: store, clock: new FixedClock(NOW) }, { actorId, query });
}

describe("searchProductsByName", () => {
  it("finds the products by their name with their sale unit, current price and where the name matched", () => {
    expect(search(ledger(), "yer")).toEqual({
      kind: "results",
      products: [
        {
          productId: "yerba",
          name: "Yerba de mate",
          saleUnit: "UNIT",
          unitPrice: 2500,
          matches: [{ start: 0, length: 3 }],
        },
      ],
      more: false,
    });
  });

  it("finds nothing for a query without words", () => {
    expect(search(ledger(), "  ")).toEqual({ kind: "results", products: [], more: false });
  });

  it("shows the price valid at the clock's moment, or none when the product has none yet", () => {
    const store = ledger({
      prices: [
        { productId: "yerba", priceListId: "list-1", unitPrice: 2500, validFrom: LONG_AGO },
        {
          productId: "yerba",
          priceListId: "list-2",
          unitPrice: 2800,
          validFrom: new Date("2026-09-01T00:00:00.000Z"),
        },
        {
          productId: "queso",
          priceListId: "list-1",
          unitPrice: 9000,
          validFrom: new Date("2026-10-01T00:00:00.000Z"),
        },
      ],
    });

    const outcome = search(store, "de");

    expect(outcome.kind === "results" && outcome.products.map((found) => found.unitPrice)).toEqual([
      null,
      2800,
    ]);
  });

  it("lists first the products most sold at this register", () => {
    const store = ledger({
      sales: [completedSaleOf("queso"), completedSaleOf("queso"), completedSaleOf("yerba")],
    });

    const outcome = search(store, "de");

    expect(outcome.kind === "results" && outcome.products.map((found) => found.productId)).toEqual([
      "queso",
      "yerba",
    ]);
  });

  it("says there are more when over twenty products match", () => {
    const products = Array.from({ length: 21 }, (_, index) => ({
      id: `p${index}`,
      name: "Arroz",
      saleUnit: "UNIT" as const,
    }));

    const outcome = search(ledger({ products }), "arroz");

    expect(outcome.kind === "results" && outcome.products).toHaveLength(20);
    expect(outcome.kind === "results" && outcome.more).toBe(true);
  });

  it("reads in one transaction and records nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    search(store, "yer");

    expect(store.transactions).toBe(1);
    expect(store.state).toEqual(before);
  });

  it.each([
    ["an actor the register does not know", "stranger"],
    ["an actor without the permission to sell and charge", "viewer"],
  ])("refuses %s", (_name, actorId) => {
    const store = ledger({
      accesses: { cashier: CASHIER, viewer: { isAdministrator: false, permissionKeys: [] } },
    });

    expect(search(store, "yer", actorId)).toEqual({ kind: "not_permitted" });
  });

  it("refuses without an open cash session", () => {
    expect(search(ledger({ session: undefined }), "yer")).toEqual({ kind: "no_open_session" });
  });

  it("refuses an actor who did not open the current session", () => {
    const store = ledger({
      accesses: { cashier: CASHIER, other: CASHIER },
      session: { id: "session-1", openedBy: "other" },
    });

    expect(search(store, "yer")).toEqual({ kind: "not_permitted" });
  });
});
