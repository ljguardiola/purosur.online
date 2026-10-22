import { describe, expect, it } from "vitest";
import type { SalePayment } from "../../payments/index.js";
import type { SaleLine, SaleWithLines } from "../model/sale.js";
import { type PreviewSaleDiscountOutcome, previewSaleDiscount } from "./preview-sale-discount.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
} from "./test-support/fake-sale-ledger.js";
import { TEN_PERCENT_SALE_DISCOUNT } from "./test-support/sale-discounts.js";

const NOW = new Date("2026-10-07T15:30:00.000Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const YERBA_LINE: SaleLine = {
  id: "line-1",
  productId: "yerba",
  productName: "Yerba 1 kg",
  saleUnit: "UNIT",
  weightSource: null,
  quantity: 3,
  listUnitPrice: 2500,
  priceListId: "list-1",
  promotions: [],
  manualAdjustment: null,
  promotionId: null,
  discountAmount: 0,
  lineTotal: 7500,
};
const AZUCAR_LINE: SaleLine = {
  ...YERBA_LINE,
  id: "line-2",
  productId: "azucar",
  productName: "Azucar",
  quantity: 1,
  listUnitPrice: 1200,
  lineTotal: 1200,
};
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  saleDiscount: null,
  lines: [YERBA_LINE, AZUCAR_LINE],
};
const PAYMENT: SalePayment = {
  id: "payment-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 1000,
  tendered: 1000,
  state: "APPROVED",
  occurredAt: NOW,
};

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    session: SESSION,
    sales: [OPEN_SALE],
    ...state,
  });
}

function preview(
  store: FakeSaleLedger,
  discount: Parameters<typeof previewSaleDiscount>[1]["discount"],
): PreviewSaleDiscountOutcome {
  return previewSaleDiscount(
    { ledger: store, restoration: store.restoration, clock: new FixedClock(NOW) },
    { actorId: "cashier", discount },
  );
}

describe("previewSaleDiscount", () => {
  it.each<[string, Parameters<typeof previewSaleDiscount>[1]["discount"], number, number]>([
    ["a percentage", { kind: "PERCENT", percent: 10 }, 870, 7830],
    ["an amount", { kind: "AMOUNT", amount: 1000 }, 1000, 7700],
    ["an amount equal to the subtotal", { kind: "AMOUNT", amount: 8700 }, 8700, 0],
  ])("answers what %s would leave the sale at", (_name, discount, saleDiscountAmount, total) => {
    expect(preview(ledger(), discount)).toEqual({
      kind: "preview",
      subtotal: 8700,
      saleDiscountAmount,
      total,
    });
  });

  it("calculates on the subtotal, not on the total the sale already has with another discount", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, saleDiscount: TEN_PERCENT_SALE_DISCOUNT }] });

    expect(preview(store, { kind: "AMOUNT", amount: 8700 })).toEqual({
      kind: "preview",
      subtotal: 8700,
      saleDiscountAmount: 8700,
      total: 0,
    });
  });

  it("records nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    preview(store, { kind: "PERCENT", percent: 10 });

    expect(store.state).toEqual(before);
    expect(store.state.outbox).toEqual([]);
  });

  it("refuses an amount above the subtotal", () => {
    expect(preview(ledger(), { kind: "AMOUNT", amount: 8701 })).toEqual({
      kind: "discount_exceeds_sale",
    });
  });

  it.each<[string, Partial<FakeSaleLedgerState>, PreviewSaleDiscountOutcome]>([
    ["the seller may not sell", { accesses: {} }, { kind: "not_permitted" }],
    [
      "the register is locked to another person",
      { session: { id: "session-1", openedBy: "other" } },
      { kind: "not_permitted" },
    ],
    ["there is no open cash session", { session: undefined }, { kind: "no_open_session" }],
    ["the session has no open sale", { sales: [] }, { kind: "no_open_sale" }],
    ["the sale has an approved payment", { payments: [PAYMENT] }, { kind: "sale_has_payments" }],
    ["the sale has no lines", { sales: [{ ...OPEN_SALE, lines: [] }] }, { kind: "empty_sale" }],
    [
      "the sale adds up to nothing",
      { sales: [{ ...OPEN_SALE, lines: [{ ...AZUCAR_LINE, lineTotal: 0 }] }] },
      { kind: "zero_total" },
    ],
  ])("answers its refusal when %s", (_name, state, expected) => {
    const store = ledger(state);
    const before = structuredClone(store.state);

    expect(preview(store, { kind: "PERCENT", percent: 10 })).toEqual(expected);
    expect(store.state).toEqual(before);
  });
});
