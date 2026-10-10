import { describe, expect, it } from "vitest";
import type { SalePayment } from "../../payments/index.js";
import { MAX_STOCK_QUANTITY } from "../../stock/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { addWeighedProduct } from "./add-weighed-product.js";
import type { CandidatePromotion } from "./sale-ledger.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  PENDING_QR_TRANSACTION,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const YERBA = { id: "yerba", name: "Yerba 1 kg", saleUnit: "UNIT" as const };
const QUESO = { id: "queso", name: "Queso cremoso", saleUnit: "KG" as const };
const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01", revision: 0 };
const OPEN_SALE: SaleWithLines = {
  id: "sale-0",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  lines: [],
};
const PAYMENT: SalePayment = {
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
const EXPIRED_PROMOTION: CandidatePromotion = { ...TEN_PERCENT, id: "old", validTo: "2026-09-01" };

function priceOf(productId: string, unitPrice: number) {
  return {
    id: `price-${productId}`,
    productId,
    priceListId: "list-1",
    unitPrice,
    validFrom: LONG_AGO,
  };
}

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    products: [YERBA, QUESO],
    prices: [priceOf("yerba", 2500), priceOf("queso", 9000)],
    ...state,
  });
}

function weigh(
  store: FakeSaleLedger,
  productId = "queso",
  weightThousandths = 1250,
  actorId = "cashier",
) {
  return addWeighedProduct(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds() },
    { actorId, productId, weightThousandths },
  );
}

describe("addWeighedProduct", () => {
  it("opens a sale with a line holding the typed weight, priced per kilogram", () => {
    const store = ledger();

    const outcome = weigh(store);

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
          productId: "queso",
          productName: "Queso cremoso",
          saleUnit: "KG",
          weightSource: "MANUAL",
          quantity: 1250,
          listUnitPrice: 9000,
          priceListId: "list-1",
          promotions: [],
          promotionId: null,
          discountAmount: 0,
          lineTotal: 11250,
        },
      ],
    };
    expect(outcome).toEqual({
      kind: "added",
      sale,
      balance: { paid: 0, pending: 11250 },
      linesLock: null,
      cancellable: true,
      cancelRefusal: null,
      refundsOnCancel: [],
    });
    expect(store.state.sales).toEqual([sale]);
  });

  it("adds the line to the sale already open", () => {
    const store = ledger({ sales: [OPEN_SALE] });

    const outcome = weigh(store);

    expect(outcome.kind === "added" && outcome.sale.id).toBe("sale-0");
    expect(store.state.sales[0]?.lines).toHaveLength(1);
  });

  it("adds a weighed product again as a separate line, never summing the weights", () => {
    const store = ledger();
    weigh(store, "queso", 1000);

    const outcome = weigh(store, "queso", 500);

    expect(outcome.kind === "added" && outcome.sale.lines).toEqual([
      expect.objectContaining({ productId: "queso", quantity: 1000, lineTotal: 9000 }),
      expect.objectContaining({ productId: "queso", quantity: 500, lineTotal: 4500 }),
    ]);
    expect(outcome.kind === "added" && outcome.balance).toEqual({ paid: 0, pending: 13500 });
  });

  it("keeps a line of a product sold by the unit beside a weighed one", () => {
    const store = ledger({ sales: [OPEN_SALE] });
    store.state.sales[0]?.lines.push({
      id: "line-0",
      productId: "yerba",
      productName: "Yerba 1 kg",
      saleUnit: "UNIT",
      weightSource: null,
      quantity: 2,
      listUnitPrice: 2500,
      priceListId: "list-1",
      promotions: [],
      promotionId: null,
      discountAmount: 0,
      lineTotal: 5000,
    });

    const outcome = weigh(store);

    expect(outcome.kind === "added" && outcome.sale.lines.map((line) => line.saleUnit)).toEqual([
      "UNIT",
      "KG",
    ]);
  });

  it("freezes the valid promotions of the product on the line and applies the best on the weight", () => {
    const store = ledger({
      promotionsByProduct: { queso: [TEN_PERCENT, EXPIRED_PROMOTION] },
    });

    const outcome = weigh(store, "queso", 2000);

    expect(outcome.kind === "added" && outcome.sale.lines).toEqual([
      expect.objectContaining({
        promotions: [{ id: "ten", benefit: TEN_PERCENT.benefit }],
        promotionId: "ten",
        discountAmount: 1800,
        lineTotal: 16200,
      }),
    ]);
  });

  it("prices the weight at the price in effect at the clock's moment", () => {
    const store = ledger({
      prices: [
        priceOf("queso", 9000),
        { ...priceOf("queso", 9500), id: "price-later", validFrom: NOW },
      ],
    });

    const outcome = weigh(store, "queso", 1000);

    expect(outcome.kind === "added" && outcome.sale.lines[0]?.listUnitPrice).toBe(9500);
  });

  it.each([1, MAX_STOCK_QUANTITY])("accepts a weight of %s thousandths", (weight) => {
    expect(weigh(ledger(), "queso", weight).kind).toBe("added");
  });

  it.each([0, -1, 1.5, Number.NaN, MAX_STOCK_QUANTITY + 1])(
    "refuses a weight of %s thousandths, changing nothing",
    (weight) => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(weigh(store, "queso", weight)).toEqual({ kind: "invalid_weight" });
      expect(store.state).toEqual(before);
    },
  );

  it("refuses a product that is not sold any more, changing nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(weigh(store, "discontinued")).toEqual({ kind: "product_unavailable" });
    expect(store.state).toEqual(before);
  });

  it("refuses a product sold by the unit, changing nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(weigh(store, "yerba")).toEqual({ kind: "not_sold_by_weight" });
    expect(store.state).toEqual(before);
  });

  it("refuses a product without a valid price, naming it and changing nothing", () => {
    const store = ledger({ prices: [] });
    const before = structuredClone(store.state);

    expect(weigh(store)).toEqual({ kind: "no_price", productName: "Queso cremoso" });
    expect(store.state).toEqual(before);
  });

  it("checks the product is sold, then that it is sold by weight, then the weight, then the price", () => {
    const store = ledger({ prices: [] });

    expect(weigh(store, "discontinued", 0)).toEqual({ kind: "product_unavailable" });
    expect(weigh(store, "yerba", 0)).toEqual({ kind: "not_sold_by_weight" });
    expect(weigh(store, "queso", 0)).toEqual({ kind: "invalid_weight" });
    expect(weigh(store, "queso", 1000)).toEqual({ kind: "no_price", productName: "Queso cremoso" });
  });

  it("refuses to open a sale when the installation was revoked", () => {
    expect(weigh(ledger({ revoked: true }))).toEqual({ kind: "installation_revoked" });
  });

  it("adds to the open sale even when the installation was revoked", () => {
    expect(weigh(ledger({ revoked: true, sales: [OPEN_SALE] })).kind).toBe("added");
  });

  it("refuses to open a sale when the register has no identity yet", () => {
    expect(weigh(ledger({ identity: undefined }))).toEqual({ kind: "unavailable" });
  });

  it("refuses an actor without the permission to sell and charge", () => {
    expect(weigh(ledger(), "queso", 1250, "stranger")).toEqual({ kind: "not_permitted" });
  });

  it("refuses without an open cash session", () => {
    expect(weigh(ledger({ session: undefined }))).toEqual({ kind: "no_open_session" });
  });

  it("checks the permission, the session, the payments, the revocation and the identity before the product", () => {
    expect(weigh(ledger({ session: undefined }), "unknown", 0, "stranger")).toEqual({
      kind: "not_permitted",
    });
    expect(weigh(ledger({ session: undefined }), "unknown", 0)).toEqual({
      kind: "no_open_session",
    });
    expect(weigh(ledger({ sales: [OPEN_SALE], payments: [PAYMENT] }), "unknown", 0)).toEqual({
      kind: "sale_has_payments",
    });
    expect(weigh(ledger({ revoked: true, identity: undefined }), "unknown", 0)).toEqual({
      kind: "installation_revoked",
    });
    expect(weigh(ledger({ identity: undefined }), "unknown", 0)).toEqual({ kind: "unavailable" });
  });

  it("tells that the sale reaches the threshold when the line brings it there", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 11250 }] });

    expect(weigh(store)).toEqual(
      expect.objectContaining({
        chargeRefusal: { kind: "reaches_buyer_identification_threshold", threshold: 11250 },
      }),
    );
  });

  it("tells nothing is refused when the line leaves the sale under the threshold", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 11251 }] });

    expect(weigh(store)).toHaveProperty("chargeRefusal", undefined);
  });

  it.each<FakeSaleLedgerWrite>(["recordOpenedSale", "recordSaleLine"])(
    "leaves nothing behind when %s fails",
    (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      expect(() => weigh(store)).toThrow(`${write} failed`);
      expect(store.state).toEqual(before);
    },
  );
});

describe("addWeighedProduct on a sale with an approved payment", () => {
  it("refuses to add a line, writing nothing", () => {
    const store = ledger({ sales: [OPEN_SALE], payments: [PAYMENT] });
    const before = structuredClone(store.state);

    expect(weigh(store)).toEqual({ kind: "sale_has_payments" });
    expect(store.state).toEqual(before);
  });

  it("still adds to a sale whose payments belong to another sale", () => {
    const store = ledger({
      sales: [OPEN_SALE],
      payments: [{ ...PAYMENT, saleId: "sale-9" }],
    });

    expect(weigh(store).kind).toBe("added");
  });
});

describe("addWeighedProduct while a QR charge of the sale is in its wait", () => {
  const pending = (waitEndsAt: Date) => ({
    ...PENDING_QR_TRANSACTION,
    id: "qr-1",
    saleId: "sale-0",
    amount: 1000,
    occurredAt: new Date(waitEndsAt.getTime() - 180_000),
    waitEndsAt,
  });

  it("refuses to add a line, writing nothing", () => {
    const store = ledger({
      sales: [OPEN_SALE],
      pendingQrPayments: [pending(new Date(NOW.getTime() + 60_000))],
    });
    const before = structuredClone(store.state);

    expect(weigh(store)).toEqual({ kind: "sale_has_payments" });
    expect(store.state).toEqual(before);
  });

  it("adds again once the wait has ended", () => {
    const store = ledger({
      sales: [OPEN_SALE],
      pendingQrPayments: [pending(new Date(NOW.getTime() - 1))],
    });

    expect(weigh(store).kind).toBe("added");
  });
});
