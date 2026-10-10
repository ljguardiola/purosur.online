import { describe, expect, it } from "vitest";
import type { SalePayment } from "../../payments/index.js";
import { MAX_STOCK_QUANTITY } from "../../stock/index.js";
import type { SaleLine, SaleWithLines } from "../model/sale.js";
import { changeLineWeight } from "./change-line-weight.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
  PENDING_QR_TRANSACTION,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const TEN_PERCENT = { id: "ten", benefit: { kind: "PERCENT_OFF" as const, percent: 10 } };
const QUESO_LINE: SaleLine = {
  id: "line-1",
  productId: "queso",
  productName: "Queso cremoso",
  saleUnit: "KG",
  weightSource: "SCALE",
  quantity: 1000,
  listUnitPrice: 9000,
  priceListId: "list-1",
  promotions: [],
  promotionId: null,
  discountAmount: 0,
  lineTotal: 9000,
};
const YERBA_LINE: SaleLine = {
  ...QUESO_LINE,
  id: "line-2",
  productId: "yerba",
  productName: "Yerba 1 kg",
  saleUnit: "UNIT",
  weightSource: null,
  quantity: 3,
  listUnitPrice: 2500,
  lineTotal: 7500,
};
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  lines: [QUESO_LINE, YERBA_LINE],
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

function storedLine(store: FakeSaleLedger, lineId: string) {
  return store.state.sales[0]?.lines.find((line) => line.id === lineId);
}

function retype(
  store: FakeSaleLedger,
  lineId: string,
  weightThousandths: number,
  actorId = "cashier",
  expectedWeightThousandths = storedLine(store, lineId)?.quantity ?? 1,
) {
  return changeLineWeight(
    { ledger: store, clock: new FixedClock(NOW) },
    { actorId, lineId, weightThousandths, expectedWeightThousandths },
  );
}

describe("changeLineWeight", () => {
  it("sets the typed weight, recomputes the amount and records the weight as typed", () => {
    const store = ledger();

    const outcome = retype(store, "line-1", 2500);

    const changed = { ...QUESO_LINE, quantity: 2500, weightSource: "MANUAL", lineTotal: 22500 };
    expect(storedLine(store, "line-1")).toEqual(changed);
    expect(outcome).toEqual({
      kind: "changed",
      sale: { ...OPEN_SALE, lines: [changed, YERBA_LINE] },
      balance: { paid: 0, pending: 30000 },
      linesLock: null,
      cancellable: true,
      cancelRefusal: null,
      refundsOnCancel: [],
    });
    expect(store.state.outbox).toEqual([]);
    expect(store.transactions).toBe(1);
  });

  it("lowers the weight too", () => {
    const store = ledger();

    retype(store, "line-1", 250);

    expect(storedLine(store, "line-1")).toEqual(
      expect.objectContaining({ quantity: 250, lineTotal: 2250, weightSource: "MANUAL" }),
    );
  });

  it("picks the promotion again on the new weight", () => {
    const promoted = { ...QUESO_LINE, promotions: [TEN_PERCENT] };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [promoted] }] });

    retype(store, "line-1", 2000);

    expect(storedLine(store, "line-1")).toEqual({
      ...promoted,
      quantity: 2000,
      weightSource: "MANUAL",
      promotionId: "ten",
      discountAmount: 1800,
      lineTotal: 16200,
    });
  });

  it("records the typed source even when the weight is the same as the scale's", () => {
    const store = ledger();

    retype(store, "line-1", 1000);

    expect(storedLine(store, "line-1")).toEqual({ ...QUESO_LINE, weightSource: "MANUAL" });
  });

  it("sets the new weight of a line whose weight was typed already", () => {
    const typed = { ...QUESO_LINE, weightSource: "MANUAL" as const };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [typed] }] });

    retype(store, "line-1", 2500);

    expect(storedLine(store, "line-1")).toEqual({ ...typed, quantity: 2500, lineTotal: 22500 });
  });

  it("writes nothing when a typed weight is typed again unchanged", () => {
    const typed = { ...QUESO_LINE, weightSource: "MANUAL" as const };
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [typed] }] });
    const before = structuredClone(store.state);
    store.failOn = "recordChangedLine";

    expect(retype(store, "line-1", 1000)).toEqual(expect.objectContaining({ kind: "changed" }));
    expect(store.state).toEqual(before);
  });

  it("applies the change when the line still has the weight the screen showed", () => {
    const store = ledger();

    expect(retype(store, "line-1", 1500, "cashier", 1000).kind).toBe("changed");
    expect(storedLine(store, "line-1")?.quantity).toBe(1500);
  });

  it("refuses a change computed from a weight the line no longer has, writing nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(retype(store, "line-1", 1500, "cashier", 900)).toEqual({ kind: "stale_weight" });
    expect(store.state).toEqual(before);
  });

  it("leaves the other lines as they were", () => {
    const store = ledger();

    retype(store, "line-1", 1500);

    expect(storedLine(store, "line-2")).toEqual(YERBA_LINE);
  });

  it("accepts the largest weight a line may carry", () => {
    expect(retype(ledger(), "line-1", MAX_STOCK_QUANTITY).kind).toBe("changed");
  });

  it.each([0, -1, 1.5, Number.NaN, MAX_STOCK_QUANTITY + 1])(
    "refuses the weight %s, changing nothing",
    (weight) => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(retype(store, "line-1", weight)).toEqual({ kind: "invalid_weight" });
      expect(store.state).toEqual(before);
    },
  );

  it("refuses a line sold by the unit, changing nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(retype(store, "line-2", 1000)).toEqual({ kind: "not_sold_by_weight" });
    expect(store.state).toEqual(before);
  });

  it("refuses a line that is not in the open sale, changing nothing", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(retype(store, "line-9", 1000)).toEqual({ kind: "unknown_line" });
    expect(store.state).toEqual(before);
  });

  it("refuses when there is no open sale, changing nothing", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, state: "COMPLETED" }] });
    const before = structuredClone(store.state);

    expect(retype(store, "line-1", 1500)).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("refuses an actor without the permission", () => {
    const store = ledger({ accesses: { cashier: { isAdministrator: false, permissionKeys: [] } } });

    expect(retype(store, "line-1", 1500)).toEqual({ kind: "not_permitted" });
  });

  it("refuses without an open cash session", () => {
    expect(retype(ledger({ session: undefined }), "line-1", 1500)).toEqual({
      kind: "no_open_session",
    });
  });

  it("refuses an actor who did not open the current session", () => {
    const store = ledger({ accesses: { cashier: CASHIER, other: CASHIER } });

    expect(retype(store, "line-1", 1500, "other")).toEqual({ kind: "not_permitted" });
  });

  it("checks the session, the sale, the payments, the weight, the line, its unit and the shown weight in that order", () => {
    expect(retype(ledger({ session: undefined }), "line-9", 0)).toEqual({
      kind: "no_open_session",
    });
    expect(retype(ledger({ sales: [] }), "line-9", 0)).toEqual({ kind: "no_open_sale" });
    expect(retype(ledger({ payments: [PAYMENT] }), "line-9", 0)).toEqual({
      kind: "sale_has_payments",
    });
    expect(retype(ledger(), "line-9", 0)).toEqual({ kind: "invalid_weight" });
    expect(retype(ledger(), "line-9", 1000)).toEqual({ kind: "unknown_line" });
    expect(retype(ledger(), "line-2", 1000, "cashier", 99)).toEqual({ kind: "not_sold_by_weight" });
    expect(retype(ledger(), "line-1", 1500, "cashier", 99)).toEqual({ kind: "stale_weight" });
  });

  it("leaves the line untouched when recording it fails", () => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = "recordChangedLine";

    expect(() => retype(store, "line-1", 1500)).toThrow("recordChangedLine failed");
    expect(store.state).toEqual(before);
  });
});

describe("change-line-weight on a sale with an approved payment", () => {
  it("refuses to change a line, writing nothing", () => {
    const store = ledger({ payments: [PAYMENT] });
    const before = structuredClone(store.state);

    expect(retype(store, "line-1", 1500)).toEqual({ kind: "sale_has_payments" });
    expect(store.state).toEqual(before);
  });

  it("changes a line of a sale whose payments belong to another sale", () => {
    const store = ledger({ payments: [{ ...PAYMENT, saleId: "sale-9" }] });

    expect(retype(store, "line-1", 1500).kind).toBe("changed");
  });
});

describe("change-line-weight while a QR charge of the sale is in its wait", () => {
  const pending = (waitEndsAt: Date) => ({
    ...PENDING_QR_TRANSACTION,
    id: "qr-1",
    saleId: "sale-1",
    amount: 1000,
    occurredAt: new Date(waitEndsAt.getTime() - 180_000),
    waitEndsAt,
  });

  it("refuses to change a line", () => {
    const store = ledger({ pendingQrPayments: [pending(new Date(NOW.getTime() + 60_000))] });

    expect(retype(store, "line-1", 1500)).toEqual({ kind: "sale_has_payments" });
  });

  it("changes a line once the wait has ended", () => {
    const store = ledger({ pendingQrPayments: [pending(new Date(NOW.getTime() - 1))] });

    expect(retype(store, "line-1", 1500).kind).toBe("changed");
  });
});

describe("change-line-weight charge refusal", () => {
  it("tells that the sale reaches the threshold when the new weight brings it there", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 30000 }] });

    expect(retype(store, "line-1", 2500)).toEqual(
      expect.objectContaining({
        chargeRefusal: { kind: "reaches_buyer_identification_threshold", threshold: 30000 },
      }),
    );
  });

  it("tells nothing is refused when the new weight leaves the sale under the threshold", () => {
    const store = ledger({ thresholds: [{ ...THRESHOLD, amount: 30001 }] });

    expect(retype(store, "line-1", 2500)).toHaveProperty("chargeRefusal", undefined);
  });
});
