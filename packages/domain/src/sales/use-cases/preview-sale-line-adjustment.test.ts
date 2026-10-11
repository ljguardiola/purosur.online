import { describe, expect, it } from "vitest";
import type { SalePayment } from "../../payments/index.js";
import type { SaleLine, SaleWithLines } from "../model/sale.js";
import {
  type PreviewSaleLineAdjustmentOutcome,
  previewSaleLineAdjustment,
} from "./preview-sale-line-adjustment.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-10-07T15:30:00.000Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const TEN_PERCENT = { id: "ten", benefit: { kind: "PERCENT_OFF" as const, percent: 10 } };
const YERBA_LINE: SaleLine = {
  id: "line-1",
  productId: "yerba",
  productName: "Yerba 1 kg",
  saleUnit: "UNIT",
  weightSource: null,
  quantity: 3,
  listUnitPrice: 2500,
  priceListId: "list-1",
  promotions: [TEN_PERCENT],
  manualAdjustment: null,
  promotionId: "ten",
  discountAmount: 750,
  lineTotal: 6750,
};
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  lines: [YERBA_LINE],
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
const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01", revision: 0 };

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    session: SESSION,
    sales: [OPEN_SALE],
    ...state,
  });
}

function preview(
  store: FakeSaleLedger,
  adjustment: Parameters<typeof previewSaleLineAdjustment>[1]["adjustment"],
  lineId = "line-1",
): PreviewSaleLineAdjustmentOutcome {
  return previewSaleLineAdjustment(
    { ledger: store, clock: new FixedClock(NOW) },
    { actorId: "cashier", lineId, adjustment },
  );
}

describe("previewSaleLineAdjustment", () => {
  it.each<[string, Parameters<typeof previewSaleLineAdjustment>[1]["adjustment"], number, number]>([
    ["a percentage off the gross amount", { kind: "PERCENT", percent: 20 }, 1500, 6000],
    ["an amount off the gross amount", { kind: "AMOUNT", amount: 1000 }, 1000, 6500],
    ["an amount equal to the gross amount", { kind: "AMOUNT", amount: 7500 }, 7500, 0],
    ["a lower price", { kind: "PRICE", unitPrice: 2000 }, 0, 6000],
    ["a higher price", { kind: "PRICE", unitPrice: 3000 }, 0, 9000],
  ])("answers what %s would leave the line at", (_name, adjustment, discountAmount, lineTotal) => {
    expect(preview(ledger(), adjustment)).toEqual({ kind: "preview", discountAmount, lineTotal });
  });

  it("records nothing and leaves the line as it was", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    preview(store, { kind: "PERCENT", percent: 20 });

    expect(store.state).toEqual(before);
    expect(store.state.outbox).toEqual([]);
  });

  it("refuses a price equal to the list price", () => {
    expect(preview(ledger(), { kind: "PRICE", unitPrice: 2500 })).toEqual({
      kind: "same_as_list_price",
    });
  });

  it("refuses an amount above the gross amount of the line", () => {
    expect(preview(ledger(), { kind: "AMOUNT", amount: 7501 })).toEqual({
      kind: "discount_exceeds_line",
    });
  });

  it("compares with the list price and the gross amount, not with an adjustment the line has", () => {
    const adjusted = {
      ...YERBA_LINE,
      manualAdjustment: {
        kind: "PRICE" as const,
        unitPrice: 100,
        reason: "caja golpeada",
        authorizedBy: null,
      },
      promotionId: null,
      discountAmount: 0,
      lineTotal: 300,
    };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [adjusted] }] });

    expect(preview(store, { kind: "PRICE", unitPrice: 2500 })).toEqual({
      kind: "same_as_list_price",
    });
    expect(preview(store, { kind: "AMOUNT", amount: 7500 })).toEqual({
      kind: "preview",
      discountAmount: 7500,
      lineTotal: 0,
    });
  });

  it.each<[string, Partial<FakeSaleLedgerState>, PreviewSaleLineAdjustmentOutcome]>([
    ["the seller may not sell", { accesses: {} }, { kind: "not_permitted" }],
    [
      "the register is locked to another person",
      { session: { id: "session-1", openedBy: "other" } },
      { kind: "not_permitted" },
    ],
    ["there is no open cash session", { session: undefined }, { kind: "no_open_session" }],
    ["the session has no open sale", { sales: [] }, { kind: "no_open_sale" }],
    ["the sale has an approved payment", { payments: [PAYMENT] }, { kind: "sale_has_payments" }],
  ])("answers its refusal when %s", (_name, state, expected) => {
    const store = ledger(state);
    const before = structuredClone(store.state);

    expect(preview(store, { kind: "PERCENT", percent: 20 })).toEqual(expected);
    expect(store.state).toEqual(before);
  });

  it("answers unknown_line for a line the sale does not have", () => {
    expect(preview(ledger(), { kind: "PERCENT", percent: 20 }, "nowhere")).toEqual({
      kind: "unknown_line",
    });
  });
});
