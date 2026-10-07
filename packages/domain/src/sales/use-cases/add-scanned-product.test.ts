import { describe, expect, it } from "vitest";
import { BARCODE_MAX_LENGTH } from "../../catalog/index.js";
import type { PaymentTransaction } from "../model/payment.js";
import type { SaleWithLines } from "../model/sale.js";
import { addScannedProduct } from "./add-scanned-product.js";
import type { CandidatePromotion } from "./sale-ledger.js";
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
  lines: [],
};

const PAYMENT: PaymentTransaction = {
  id: "payment-1",
  saleId: "sale-0",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 1000,
  tendered: 1000,
  state: "APPROVED",
  occurredAt: NOW,
};

const TEN_PERCENT: CandidatePromotion = {
  id: "ten",
  benefit: { kind: "PERCENT_OFF", percent: 10 },
  active: true,
  validFrom: "2026-09-01",
  validTo: "2026-12-31",
  weekdays: [],
};
const THREE_FOR_TWO: CandidatePromotion = {
  ...TEN_PERCENT,
  id: "three-for-two",
  benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
};

const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01" };

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    identity: IDENTITY,
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
    expect(outcome).toEqual({
      kind: "added",
      sale,
      balance: { paid: 0, pending: 2500 },
      linesEditable: true,
      cancellable: true,
    });
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
        {
          id: "price-2",
          productId: "yerba",
          priceListId: "list-1",
          unitPrice: 2500,
          validFrom: LONG_AGO,
        },
        {
          id: "price-3",
          productId: "fideos",
          priceListId: "list-1",
          unitPrice: 900,
          validFrom: LONG_AGO,
        },
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
        {
          id: "price-4",
          productId: "yerba",
          priceListId: "list-1",
          unitPrice: 2500,
          validFrom: LONG_AGO,
        },
        {
          id: "price-5",
          productId: "fideos",
          priceListId: "list-1",
          unitPrice: 900,
          validFrom: LONG_AGO,
        },
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
      id: "price-6",
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
        {
          id: "price-7",
          productId: "yerba",
          priceListId: "list-1",
          unitPrice: 2500,
          validFrom: LONG_AGO,
        },
        {
          id: "price-8",
          productId: "yerba",
          priceListId: "list-2",
          unitPrice: 2800,
          validFrom: new Date("2026-09-01T00:00:00.000Z"),
        },
        {
          id: "price-9",
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

  it("answers a code longer than any barcode as unknown without looking it up", () => {
    const store = ledger();

    expect(scan(store, "7".repeat(BARCODE_MAX_LENGTH + 1))).toEqual({ kind: "unknown_code" });
    expect(store.barcodeLookups).toBe(0);
  });

  it.each([
    ["has no open cash session", { session: undefined }, "no_open_session"],
    ["is not permitted to sell", { accesses: {} }, "not_permitted"],
  ])("refuses a too-long code with the session refusal when the actor %s", (_name, state, kind) => {
    const store = ledger(state);

    expect(scan(store, "7".repeat(BARCODE_MAX_LENGTH + 1))).toEqual({ kind });
  });

  it("looks up a code as long as the longest barcode", () => {
    const store = ledger();

    expect(scan(store, "7".repeat(BARCODE_MAX_LENGTH))).toEqual({ kind: "unknown_code" });
    expect(store.barcodeLookups).toBe(1);
  });

  it("refuses a product without a valid price, naming it and changing nothing", () => {
    const store = ledger({
      prices: [
        {
          id: "price-10",
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
      prices: [
        {
          id: "price-11",
          productId: "queso",
          priceListId: "list-1",
          unitPrice: 9000,
          validFrom: LONG_AGO,
        },
      ],
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
      prices: [
        {
          id: "price-12",
          productId: "yerba",
          priceListId: "list-1",
          unitPrice: 2500,
          validFrom: NOW,
        },
      ],
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

  describe("promotions", () => {
    it("adds a new line with the best promotion valid now and freezes the valid ones on it", () => {
      const store = ledger({ promotionsByProduct: { yerba: [TEN_PERCENT, THREE_FOR_TWO] } });

      const outcome = scan(store);

      const expected = expect.objectContaining({
        promotions: [
          { id: "ten", benefit: { kind: "PERCENT_OFF", percent: 10 } },
          { id: "three-for-two", benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } },
        ],
        promotionId: "ten",
        discountAmount: 250,
        lineTotal: 2250,
      });
      expect(outcome.kind === "added" && outcome.sale.lines).toEqual([expected]);
      expect(store.state.sales[0]?.lines).toEqual([expected]);
    });

    it("switches to buy 3 pay 2 when the third unit is scanned, among the promotions frozen with the line", () => {
      const store = ledger({ promotionsByProduct: { yerba: [TEN_PERCENT, THREE_FOR_TWO] } });

      const applied = [scan(store), scan(store), scan(store)].map(
        (outcome) => outcome.kind === "added" && outcome.sale.lines[0]?.promotionId,
      );

      expect(applied).toEqual(["ten", "ten", "three-for-two"]);
      expect(store.state.sales[0]?.lines[0]).toEqual(
        expect.objectContaining({
          promotionId: "three-for-two",
          discountAmount: 2500,
          lineTotal: 5000,
        }),
      );
    });

    it.each<[string, Partial<CandidatePromotion>]>([
      ["deactivated", { active: false }],
      ["not started yet", { validFrom: "2026-10-01" }],
      ["already ended", { validTo: "2026-09-29" }],
      ["limited to other days of the week", { weekdays: [1, 2] }],
    ])("does not apply a promotion that is %s", (_name, change) => {
      const store = ledger({ promotionsByProduct: { yerba: [{ ...TEN_PERCENT, ...change }] } });

      const outcome = scan(store);

      expect(outcome.kind === "added" && outcome.sale.lines).toEqual([
        expect.objectContaining({
          promotions: [],
          promotionId: null,
          discountAmount: 0,
          lineTotal: 2500,
        }),
      ]);
    });

    it("applies a promotion limited to the weekday of the clock's moment", () => {
      const wednesday = 3;
      const store = ledger({
        promotionsByProduct: { yerba: [{ ...TEN_PERCENT, weekdays: [wednesday] }] },
      });

      const outcome = scan(store);

      expect(outcome.kind === "added" && outcome.sale.lines[0]?.promotionId).toBe("ten");
    });

    it("judges validity on the store's calendar day, not the UTC day", () => {
      const lateEvening = new Date("2026-10-01T01:30:00.000Z");
      const store = ledger({
        promotionsByProduct: {
          yerba: [
            { ...TEN_PERCENT, id: "ends-that-day", validTo: "2026-09-30" },
            { ...TEN_PERCENT, id: "starts-next-day", validFrom: "2026-10-01" },
          ],
        },
      });

      const outcome = addScannedProduct(
        { ledger: store, clock: new FixedClock(lateEvening), ids: new SequentialIds() },
        { actorId: "cashier", code: "7790001" },
      );

      expect(outcome.kind === "added" && outcome.sale.lines[0]?.promotions).toEqual([
        { id: "ends-that-day", benefit: { kind: "PERCENT_OFF", percent: 10 } },
      ]);
    });

    it("does not read promotions again when a unit is added to an existing line", () => {
      const store = ledger({ promotionsByProduct: { yerba: [TEN_PERCENT] } });
      scan(store);
      store.state.promotionsByProduct = {
        yerba: [{ ...TEN_PERCENT, id: "new", benefit: { kind: "PERCENT_OFF", percent: 90 } }],
      };
      store.promotionReads = 0;

      const outcome = scan(store);

      expect(store.promotionReads).toBe(0);
      expect(outcome.kind === "added" && outcome.sale.lines[0]).toEqual(
        expect.objectContaining({ promotionId: "ten", lineTotal: 4500 }),
      );
    });

    it("does not look for promotions of a product it refuses", () => {
      const store = ledger({ prices: [], promotionsByProduct: { yerba: [TEN_PERCENT] } });

      scan(store);

      expect(store.promotionReads).toBe(0);
    });

    it("reads the promotions of the scanned product", () => {
      const store = ledger({
        promotionsByProduct: { fideos: [TEN_PERCENT], yerba: [THREE_FOR_TWO] },
      });

      const outcome = scan(store);

      expect(outcome.kind === "added" && outcome.sale.lines[0]?.promotions).toEqual([
        { id: "three-for-two", benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } },
      ]);
    });
  });
});

describe("add-scanned-product charge refusal", () => {
  it("tells that the sale reaches the threshold when adding a scanned product brings it to the threshold", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 2500 }] });

    expect(scan(store)).toEqual(
      expect.objectContaining({
        chargeRefusal: { kind: "reaches_buyer_identification_threshold", threshold: 2500 },
      }),
    );
  });

  it("tells nothing is refused when adding a scanned product leaves the sale under the threshold", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 2501 }] });

    expect(scan(store)).toHaveProperty("chargeRefusal", undefined);
  });

  it("tells that no threshold is in effect when there is none", () => {
    const store = ledger({ thresholds: [] });

    expect(scan(store)).toEqual(
      expect.objectContaining({ chargeRefusal: { kind: "no_buyer_identification_threshold" } }),
    );
  });
});

describe("add-scanned-product on a sale with an approved payment", () => {
  it("refuses to add a line, writing nothing", () => {
    const store = ledger({ sales: [OPEN_SALE], payments: [PAYMENT] });
    const before = structuredClone(store.state);

    expect(scan(store)).toEqual({ kind: "sale_has_payments" });
    nothingRecorded(store, before);
  });

  it("refuses before looking the barcode up", () => {
    const store = ledger({ sales: [OPEN_SALE], payments: [PAYMENT] });

    expect(scan(store, "unknown")).toEqual({ kind: "sale_has_payments" });
    expect(store.barcodeLookups).toBe(0);
  });

  it("still adds to a sale whose payments belong to another sale", () => {
    const store = ledger({
      sales: [OPEN_SALE],
      payments: [{ ...PAYMENT, saleId: "sale-9" }],
    });

    expect(scan(store)).toMatchObject({ kind: "added" });
  });
});
