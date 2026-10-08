import { describe, expect, it } from "vitest";
import type { PaymentTransaction } from "../model/payment.js";
import type { SaleWithLines } from "../model/sale.js";
import { addSearchedProduct } from "./add-searched-product.js";
import type { CandidatePromotion } from "./sale-ledger.js";
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
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    products: [YERBA, QUESO, FIDEOS],
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
      refundsOnCancel: [],
    });
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

  it("freezes the chosen product's valid promotions on its line and re-picks among them as units are added", () => {
    const store = ledger({
      promotionsByProduct: { yerba: [TEN_PERCENT, THREE_FOR_TWO], fideos: [TEN_PERCENT] },
    });

    const outcomes = [add(store), add(store), add(store)];

    expect(outcomes.map((outcome) => outcome.kind === "added" && outcome.sale.lines[0])).toEqual([
      expect.objectContaining({
        promotions: [
          { id: "ten", benefit: { kind: "PERCENT_OFF", percent: 10 } },
          { id: "three-for-two", benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } },
        ],
        promotionId: "ten",
        lineTotal: 2250,
      }),
      expect.objectContaining({ promotionId: "ten", lineTotal: 4500 }),
      expect.objectContaining({ promotionId: "three-for-two", lineTotal: 5000 }),
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

describe("add-searched-product charge refusal", () => {
  it("tells that the sale reaches the threshold when adding a searched product brings it to the threshold", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 2500 }] });

    expect(add(store)).toEqual(
      expect.objectContaining({
        chargeRefusal: { kind: "reaches_buyer_identification_threshold", threshold: 2500 },
      }),
    );
  });

  it("tells nothing is refused when adding a searched product leaves the sale under the threshold", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 2501 }] });

    expect(add(store)).toHaveProperty("chargeRefusal", undefined);
  });

  it("tells that no threshold is in effect when there is none", () => {
    const store = ledger({ thresholds: [] });

    expect(add(store)).toEqual(
      expect.objectContaining({ chargeRefusal: { kind: "no_buyer_identification_threshold" } }),
    );
  });
});

describe("add-searched-product on a sale with an approved payment", () => {
  const OPEN_SALE: SaleWithLines = {
    id: "sale-0",
    registerId: "register-1",
    deviceId: "device-1",
    sessionId: "session-1",
    actorId: "cashier",
    state: "OPEN",
    lines: [],
  };

  it("refuses to add a line, writing nothing", () => {
    const store = ledger({ sales: [OPEN_SALE], payments: [PAYMENT] });
    const before = structuredClone(store.state);

    expect(add(store)).toEqual({ kind: "sale_has_payments" });
    expect(store.state).toEqual(before);
  });

  it("refuses before looking the product up", () => {
    const store = ledger({ sales: [OPEN_SALE], payments: [PAYMENT] });

    expect(add(store, "unknown")).toEqual({ kind: "sale_has_payments" });
  });

  it("still adds to a sale whose payments belong to another sale", () => {
    const store = ledger({
      sales: [OPEN_SALE],
      payments: [{ ...PAYMENT, saleId: "sale-9" }],
    });

    expect(add(store)).toMatchObject({ kind: "added" });
  });
});
