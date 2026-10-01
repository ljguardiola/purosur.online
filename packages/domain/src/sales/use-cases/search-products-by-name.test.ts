import { describe, expect, it } from "vitest";
import { PRODUCT_NAME_MAX_LENGTH } from "../../catalog/index.js";
import type { SaleState } from "../model/sale.js";
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

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    products: [YERBA, QUESO],
    prices: [
      {
        id: "price-1",
        productId: "yerba",
        priceListId: "list-1",
        unitPrice: 2500,
        validFrom: LONG_AGO,
      },
      {
        id: "price-2",
        productId: "queso",
        priceListId: "list-1",
        unitPrice: 9000,
        validFrom: LONG_AGO,
      },
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

  it("answers a query longer than any product name with no results without reaching storage", () => {
    const store = ledger();

    expect(search(store, "y".repeat(PRODUCT_NAME_MAX_LENGTH + 1))).toEqual({
      kind: "results",
      products: [],
      more: false,
    });
    expect(store.transactions).toBe(0);
  });

  it("searches a query as long as the longest product name", () => {
    const store = ledger();

    expect(search(store, "y".repeat(PRODUCT_NAME_MAX_LENGTH))).toEqual({
      kind: "results",
      products: [],
      more: false,
    });
    expect(store.transactions).toBe(1);
  });

  it("shows the price valid at the clock's moment, or none when the product has none yet", () => {
    const store = ledger({
      prices: [
        {
          id: "price-3",
          productId: "yerba",
          priceListId: "list-1",
          unitPrice: 2500,
          validFrom: LONG_AGO,
        },
        {
          id: "price-4",
          productId: "yerba",
          priceListId: "list-2",
          unitPrice: 2800,
          validFrom: new Date("2026-09-01T00:00:00.000Z"),
        },
        {
          id: "price-5",
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

  it("lists first the product this register's completed sales sold more", () => {
    const sale = (id: string, productId: string, state: SaleState, registerId = "register-1") => ({
      id,
      registerId,
      deviceId: "device-1",
      sessionId: "session-0",
      actorId: "cashier",
      state,
      occurredAt: LONG_AGO,
      lines: [
        {
          id: `${id}-line`,
          productId,
          productName: productId,
          quantity: 1,
          listUnitPrice: 100,
          priceListId: "list-1",
          promotions: [],
          promotionId: null,
          discountAmount: 0,
          lineTotal: 100,
        },
      ],
    });
    const store = ledger({
      sales: [
        sale("sold-here", "yerba", "COMPLETED"),
        sale("still-open", "queso", "OPEN"),
        sale("voided", "queso", "VOIDED"),
        sale("other-register", "queso", "COMPLETED", "register-2"),
      ],
    });

    const outcome = search(store, "de");

    expect(outcome.kind === "results" && outcome.products.map((found) => found.productId)).toEqual([
      "yerba",
      "queso",
    ]);
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
