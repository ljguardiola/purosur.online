import { describe, expect, it } from "vitest";
import type { SaleWithLines } from "../model/sale.js";
import { addScannedProduct } from "./add-scanned-product.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const IDENTITY = { registerId: "register-1", deviceId: "device-1" };
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const YERBA = { id: "yerba", name: "Yerba 1 kg", saleUnit: "UNIT" as const };
const QUESO = { id: "queso", name: "Queso cremoso", saleUnit: "KG" as const };
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");
const OPEN_SALE: SaleWithLines = {
  id: "sale-0",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  occurredAt: new Date("2026-09-30T12:00:00.000Z"),
  lines: [],
};

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: IDENTITY,
    session: SESSION,
    products: [YERBA, QUESO],
    barcodes: { "7790001": "yerba", "7790002": "queso" },
    prices: [{ productId: "yerba", priceListId: "list-1", unitPrice: 2500, validFrom: LONG_AGO }],
    ...state,
  });
}

function scan(store: FakeSaleLedger, code = "7790001", actorId = "cashier") {
  return addScannedProduct(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds() },
    { actorId, code },
  );
}

function nothingRecorded(store: FakeSaleLedger, before: FakeSaleLedgerState): void {
  expect(store.state).toEqual(before);
}

describe("addScannedProduct", () => {
  it("opens a sale with the first scan and adds a line at the current list price", () => {
    const store = ledger();

    const outcome = scan(store);

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
          promotions: [],
          promotionId: null,
          discountAmount: 0,
          lineTotal: 2500,
        },
      ],
    };
    expect(outcome).toEqual({ kind: "added", sale });
    expect(store.state.sales).toEqual([sale]);
  });

  it("does everything in one transaction", () => {
    const store = ledger();

    scan(store);

    expect(store.transactions).toBe(1);
  });

  it("adds the line to the sale that is already open without opening another", () => {
    const store = ledger({
      sales: [OPEN_SALE],
      products: [YERBA, { id: "fideos", name: "Fideos", saleUnit: "UNIT" }],
      barcodes: { "7790001": "yerba", "7790003": "fideos" },
      prices: [
        { productId: "yerba", priceListId: "list-1", unitPrice: 2500, validFrom: LONG_AGO },
        { productId: "fideos", priceListId: "list-1", unitPrice: 900, validFrom: LONG_AGO },
      ],
    });

    scan(store);
    const outcome = scan(store, "7790003");

    expect(store.state.sales).toHaveLength(1);
    expect(outcome.kind === "added" && outcome.sale.id).toBe("sale-0");
    expect(outcome.kind === "added" && outcome.sale.lines.map((line) => line.productName)).toEqual([
      "Yerba 1 kg",
      "Fideos",
    ]);
  });

  it("scanning a unit product again adds a unit to its line and recomputes the total", () => {
    const store = ledger();
    scan(store);

    const outcome = scan(store);

    expect(outcome.kind === "added" && outcome.sale.lines).toEqual([
      expect.objectContaining({ quantity: 2, listUnitPrice: 2500, lineTotal: 5000 }),
    ]);
    expect(store.state.sales[0]?.lines).toHaveLength(1);
  });

  it("adding a unit to one line leaves the other lines as they were", () => {
    const store = ledger({
      products: [YERBA, { id: "fideos", name: "Fideos", saleUnit: "UNIT" }],
      barcodes: { "7790001": "yerba", "7790003": "fideos" },
      prices: [
        { productId: "yerba", priceListId: "list-1", unitPrice: 2500, validFrom: LONG_AGO },
        { productId: "fideos", priceListId: "list-1", unitPrice: 900, validFrom: LONG_AGO },
      ],
    });
    scan(store);
    scan(store, "7790003");

    const outcome = scan(store);

    expect(outcome.kind === "added" && outcome.sale.lines).toEqual([
      expect.objectContaining({ productName: "Yerba 1 kg", quantity: 2, lineTotal: 5000 }),
      expect.objectContaining({ productName: "Fideos", quantity: 1, lineTotal: 900 }),
    ]);
    expect(store.state.sales[0]?.lines.map((line) => line.quantity)).toEqual([2, 1]);
  });

  it("keeps the price a line was added with when the price changes afterwards", () => {
    const store = ledger();
    scan(store);
    store.state.prices.push({
      productId: "yerba",
      priceListId: "list-2",
      unitPrice: 3000,
      validFrom: new Date("2026-09-30T12:00:00.000Z"),
    });

    const outcome = scan(store);

    expect(outcome.kind === "added" && outcome.sale.lines).toEqual([
      expect.objectContaining({ priceListId: "list-1", listUnitPrice: 2500, lineTotal: 5000 }),
    ]);
  });

  it("adds a unit to a line at its price even when the product has no valid price any more", () => {
    const store = ledger();
    scan(store);
    store.state.prices = [];

    const outcome = scan(store);

    expect(outcome.kind === "added" && outcome.sale.lines).toEqual([
      expect.objectContaining({ priceListId: "list-1", quantity: 2, lineTotal: 5000 }),
    ]);
  });

  it("uses the latest price already valid at the clock's moment", () => {
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
          productId: "yerba",
          priceListId: "list-3",
          unitPrice: 9999,
          validFrom: new Date("2026-10-01T00:00:00.000Z"),
        },
      ],
    });

    const outcome = scan(store);

    expect(outcome.kind === "added" && outcome.sale.lines).toEqual([
      expect.objectContaining({ priceListId: "list-2", listUnitPrice: 2800 }),
    ]);
  });

  it("lets an Administrator sell without holding the permission key", () => {
    const store = ledger({
      accesses: { boss: { isAdministrator: true, permissionKeys: [] } },
      session: { id: "session-1", openedBy: "boss" },
    });

    expect(scan(store, "7790001", "boss").kind).toBe("added");
  });

  it("keeps accepting lines on an open sale after the installation was revoked", () => {
    const store = ledger({ sales: [OPEN_SALE], revoked: true });

    expect(scan(store).kind).toBe("added");
  });

  it("keeps accepting lines on an open sale when the register has no identity", () => {
    const store = ledger({ sales: [OPEN_SALE], identity: undefined });

    expect(scan(store).kind).toBe("added");
  });

  it("does not add to a sale of another session or one that is not open", () => {
    const store = ledger({
      sales: [
        { ...OPEN_SALE, id: "other-session", sessionId: "session-0" },
        { ...OPEN_SALE, id: "completed", state: "COMPLETED" },
      ],
    });

    const outcome = scan(store);

    expect(outcome.kind === "added" && outcome.sale.id).toBe("id-1");
  });

  it.each([
    ["an actor the register does not know", "stranger"],
    ["an actor without the permission to sell and charge", "viewer"],
  ])("refuses %s", (_name, actorId) => {
    const store = ledger({
      accesses: { cashier: CASHIER, viewer: { isAdministrator: false, permissionKeys: [] } },
    });
    const before = structuredClone(store.state);

    expect(scan(store, "7790001", actorId)).toEqual({ kind: "not_permitted" });
    nothingRecorded(store, before);
  });

  it("refuses without an open cash session", () => {
    const store = ledger({ session: undefined });
    const before = structuredClone(store.state);

    expect(scan(store)).toEqual({ kind: "no_open_session" });
    nothingRecorded(store, before);
  });

  it("refuses an actor who did not open the current session", () => {
    const store = ledger({
      accesses: { cashier: CASHIER, other: CASHIER },
      session: { id: "session-1", openedBy: "other" },
    });
    const before = structuredClone(store.state);

    expect(scan(store)).toEqual({ kind: "not_permitted" });
    nothingRecorded(store, before);
  });

  it("refuses to open a new sale when the installation was revoked", () => {
    const store = ledger({ revoked: true });
    const before = structuredClone(store.state);

    expect(scan(store)).toEqual({ kind: "installation_revoked" });
    nothingRecorded(store, before);
  });

  it("refuses to open a new sale when the register has no identity yet", () => {
    const store = ledger({ identity: undefined });
    const before = structuredClone(store.state);

    expect(scan(store)).toEqual({ kind: "unavailable" });
    nothingRecorded(store, before);
  });

  it("refuses a code no active product has, changing nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(scan(store, "0000")).toEqual({ kind: "unknown_code" });
    nothingRecorded(store, before);
  });

  it("refuses a product without a valid price, naming it and changing nothing", () => {
    const store = ledger({
      prices: [
        {
          productId: "yerba",
          priceListId: "list-1",
          unitPrice: 2500,
          validFrom: new Date("2026-10-01T00:00:00.000Z"),
        },
      ],
    });
    const before = structuredClone(store.state);

    expect(scan(store)).toEqual({ kind: "no_price", productName: "Yerba 1 kg" });
    nothingRecorded(store, before);
  });

  it("refuses a product sold by weight, naming it and changing nothing", () => {
    const store = ledger({
      prices: [{ productId: "queso", priceListId: "list-1", unitPrice: 9000, validFrom: LONG_AGO }],
    });
    const before = structuredClone(store.state);

    expect(scan(store, "7790002")).toEqual({
      kind: "sold_by_weight",
      productName: "Queso cremoso",
    });
    nothingRecorded(store, before);
  });

  it("checks the actor's permission before whether a session is open", () => {
    expect(scan(ledger({ session: undefined }), "7790001", "stranger")).toEqual({
      kind: "not_permitted",
    });
  });

  it("checks that a session is open before whether the actor opened it", () => {
    const store = ledger({ accesses: { stranger: CASHIER }, session: undefined });

    expect(scan(store, "7790001", "stranger")).toEqual({ kind: "no_open_session" });
  });

  it("checks the installation's revocation before the register's identity", () => {
    expect(scan(ledger({ revoked: true, identity: undefined }))).toEqual({
      kind: "installation_revoked",
    });
  });

  it("checks the register's identity before looking the code up", () => {
    expect(scan(ledger({ identity: undefined }), "0000")).toEqual({ kind: "unavailable" });
  });

  it("checks the code before the sale unit and the sale unit before the price", () => {
    const store = ledger({ prices: [] });

    expect(scan(store, "0000")).toEqual({ kind: "unknown_code" });
    expect(scan(store, "7790002")).toEqual({
      kind: "sold_by_weight",
      productName: "Queso cremoso",
    });
    expect(scan(store, "7790001")).toEqual({ kind: "no_price", productName: "Yerba 1 kg" });
  });

  it("asks for the price at the clock's moment", () => {
    const store = ledger({
      prices: [{ productId: "yerba", priceListId: "list-1", unitPrice: 2500, validFrom: NOW }],
    });

    expect(scan(store).kind).toBe("added");
  });

  it.each<FakeSaleLedgerWrite>(["recordOpenedSale", "recordSaleLine"])(
    "leaves nothing behind when %s fails on the first scan",
    (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      expect(() => scan(store)).toThrow(`${write} failed`);
      nothingRecorded(store, before);
    },
  );

  it("leaves the line untouched when recording its new quantity fails", () => {
    const store = ledger();
    scan(store);
    const before = structuredClone(store.state);
    store.failOn = "recordLineQuantity";

    expect(() => scan(store)).toThrow("recordLineQuantity failed");
    nothingRecorded(store, before);
  });
});
