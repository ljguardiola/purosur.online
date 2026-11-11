import { describe, expect, it } from "vitest";
import { BARCODE_MAX_LENGTH } from "../../catalog/index.js";
import { findProductByCode } from "./find-product-by-code.js";
import { FakeSaleLedger, type FakeSaleLedgerState } from "./test-support/fake-sale-ledger.js";

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
    barcodes: { "7790001": "yerba", "7790002": "queso" },
    prices: [
      {
        id: "price-1",
        productId: "yerba",
        priceListId: "list-1",
        unitPrice: 2500,
        validFrom: LONG_AGO,
      },
    ],
    ...state,
  });
}

function find(store: FakeSaleLedger, code: string, actorId = "cashier") {
  return findProductByCode({ ledger: store, restoration: store.restoration }, { actorId, code });
}

describe("findProductByCode", () => {
  it("finds the product behind a code with its name, sale unit and current price", () => {
    expect(find(ledger(), "7790001")).toEqual({
      kind: "found",
      product: { productId: "yerba", name: "Yerba de mate", saleUnit: "UNIT", unitPrice: 2500 },
    });
  });

  it("finds a product with no synced price yet without a price", () => {
    expect(find(ledger(), "7790002")).toEqual({
      kind: "found",
      product: { productId: "queso", name: "Queso de cabra", saleUnit: "KG", unitPrice: null },
    });
  });

  it("shows the newest synced price, even one starting after the register's clock", () => {
    const store = ledger({
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
          productId: "yerba",
          priceListId: "list-2",
          unitPrice: 2800,
          validFrom: new Date("2026-09-01T00:00:00.000Z"),
        },
      ],
    });

    const outcome = find(store, "7790001");

    expect(outcome.kind === "found" && outcome.product.unitPrice).toBe(2800);
  });

  it("answers a code no active product has as unknown", () => {
    expect(find(ledger(), "0000")).toEqual({ kind: "unknown_code" });
  });

  it("answers a code longer than any barcode as unknown without looking it up", () => {
    const store = ledger();

    expect(find(store, "7".repeat(BARCODE_MAX_LENGTH + 1))).toEqual({ kind: "unknown_code" });
    expect(store.barcodeLookups).toBe(0);
  });

  it("looks up a code as long as the longest barcode", () => {
    const store = ledger();

    expect(find(store, "7".repeat(BARCODE_MAX_LENGTH))).toEqual({ kind: "unknown_code" });
    expect(store.barcodeLookups).toBe(1);
  });

  it.each([
    ["has no open cash session", { session: undefined }, "no_open_session"],
    ["is not permitted to sell", { accesses: {} }, "not_permitted"],
  ])("refuses a too-long code with the session refusal when the actor %s", (_name, state, kind) => {
    const store = ledger(state);

    expect(find(store, "7".repeat(BARCODE_MAX_LENGTH + 1))).toEqual({ kind });
  });

  it("reads in one transaction and records nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    find(store, "7790001");

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

    expect(find(store, "7790001", actorId)).toEqual({ kind: "not_permitted" });
  });

  it("refuses without an open cash session", () => {
    expect(find(ledger({ session: undefined }), "7790001")).toEqual({ kind: "no_open_session" });
  });

  it("refuses an actor who did not open the current session", () => {
    const store = ledger({
      accesses: { cashier: CASHIER, other: CASHIER },
      session: { id: "session-1", openedBy: "other" },
    });

    expect(find(store, "7790001")).toEqual({ kind: "not_permitted" });
  });
});
