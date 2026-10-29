import {
  PENDING_POINT_TRANSACTION,
  PENDING_QR_TRANSACTION,
} from "@purosur/domain/payments/test-support";
import { describe, expect, it } from "vitest";
import type { SalePayment } from "../../payments/index.js";
import { TEN_PERCENT_SALE_DISCOUNT } from "./test-support/sale-discounts.js";
import type { SaleWithLines } from "../model/sale.js";
import { cancelSale } from "./cancel-sale.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-10-09T12:00:00.000Z");

function pendingQrEndingAt(waitEndsAt: Date) {
  return {
    ...PENDING_QR_TRANSACTION,
    id: "qr-1",
    saleId: "sale-1",
    amount: 1000,
    occurredAt: new Date(waitEndsAt.getTime() - 180_000),
    waitEndsAt,
  };
}

const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const YERBA_LINE = {
  id: "line-1",
  productId: "yerba",
  productName: "Yerba 1 kg",
  saleUnit: "UNIT" as const,
  weightSource: null,
  quantity: 3,
  listUnitPrice: 2500,
  priceListId: "list-1",
  promotions: [
    { id: "ten", name: "Diez por ciento", benefit: { kind: "PERCENT_OFF" as const, percent: 10 } },
  ],
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
  saleDiscount: null,
  lines: [YERBA_LINE],
};
const APPROVED_PAYMENT: SalePayment = {
  id: "payment-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 6750,
  state: "APPROVED",
  occurredAt: new Date("2026-09-30T12:20:00.000Z"),
};
const YERBA_LINE_RECORD = {
  id: "line-1",
  product_id: "yerba",
  product_name: "Yerba 1 kg",
  weight_source: null,
  manual_adjustment: null,
  quantity: 3,
  list_unit_price: 2500,
  price_list_id: "list-1",
  promotion_id: "ten",
  discount_amount: 750,
  promotions: [
    { discount_id: "ten", kind: "PERCENT_OFF", percent: 10, buy_qty: null, pay_qty: null },
  ],
  sale_discount_share: 0,
  line_total: 6750,
};

function cancelledEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id: "id-1",
    aggregate_type: "Sale",
    aggregate_id: "sale-1",
    event_type: "sale_cancelled",
    schema_version: 9,
    payload: {
      id: "sale-1",
      register_id: "register-1",
      device_id: "device-1",
      session_id: "session-1",
      actor_id: "cashier",
      authorized_by: null,
      occurred_at: NOW.toISOString(),
      total: 6750,
      sale_discount: null,
      lines: [YERBA_LINE_RECORD],
      payments: [],
      refunds: [],
      cash_movements: [],
      ...overrides,
    },
    occurred_at: NOW.toISOString(),
    actor_id: "cashier",
  };
}

const COMPLETED_SALE: SaleWithLines = {
  ...OPEN_SALE,
  id: "sale-0",
  state: "COMPLETED",
  lines: [{ ...YERBA_LINE, id: "line-0" }],
};

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    session: SESSION,
    sales: [OPEN_SALE],
    ...state,
  });
}

function cancel(store: FakeSaleLedger, actorId = "cashier") {
  return cancelSale(
    {
      ledger: store,
      restoration: store.restoration,
      clock: new FixedClock(NOW),
      ids: new SequentialIds(),
    },
    { actorId },
  );
}

describe("cancelSale", () => {
  it("discards the open sale with its lines and records only that it was cancelled", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    const outcome = cancel(store);

    expect(outcome).toEqual({ kind: "cancelled" });
    expect(store.state).toEqual({ ...before, sales: [], outbox: [cancelledEvent()] });
    expect(store.transactions).toBe(1);
  });

  it("records the lines with the share of the sale discount they carried", () => {
    const store = ledger({
      sales: [
        {
          ...OPEN_SALE,
          saleDiscount: TEN_PERCENT_SALE_DISCOUNT,
          lines: [YERBA_LINE, { ...YERBA_LINE, id: "line-2", lineTotal: 3250 }],
        },
      ],
    });

    cancel(store);

    expect(store.state.outbox).toEqual([
      cancelledEvent({
        total: 9000,
        sale_discount: {
          kind: "PERCENT",
          value: 10,
          amount: 1000,
          reason: TEN_PERCENT_SALE_DISCOUNT.reason,
          authorized_by: TEN_PERCENT_SALE_DISCOUNT.authorizedBy,
        },
        lines: [
          { ...YERBA_LINE_RECORD, sale_discount_share: 675, line_total: 6075 },
          { ...YERBA_LINE_RECORD, id: "line-2", sale_discount_share: 325, line_total: 2925 },
        ],
      }),
    ]);
  });

  it("records the cancelled sale with the cash movements it already had", () => {
    const store = ledger({
      movements: [
        {
          id: "movement-1",
          sessionId: "session-1",
          type: "SALE",
          amount: 100,
          actorId: "cashier",
          occurredAt: NOW,
          ref: { type: "sale", id: "sale-1" },
        },
        {
          id: "movement-0",
          sessionId: "session-1",
          type: "SALE",
          amount: 100,
          actorId: "cashier",
          occurredAt: NOW,
          ref: { type: "sale", id: "sale-0" },
        },
      ],
    });

    cancel(store);

    expect(store.state.outbox).toEqual([
      cancelledEvent({
        cash_movements: [
          {
            id: "movement-1",
            type: "SALE",
            amount: 100,
            ref_type: "sale",
            ref_id: "sale-1",
            actor_id: "cashier",
            occurred_at: NOW.toISOString(),
          },
        ],
      }),
    ]);
  });

  it("records the cancellation under the actor who cancels, not the one who opened the sale", () => {
    const store = ledger({
      accesses: { cashier: CASHIER, former: CASHIER },
      sales: [{ ...OPEN_SALE, actorId: "former" }],
    });

    cancel(store);

    expect(store.state.outbox).toEqual([
      expect.objectContaining({
        actor_id: "cashier",
        payload: expect.objectContaining({ actor_id: "former" }),
      }),
    ]);
  });

  it("answers that it is unavailable while the outbox is not ready, leaving everything as it was", () => {
    const store = ledger({ outboxReady: false });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "unavailable" });
    expect(store.state).toEqual(before);
  });

  it("answers the refusals of the sale before the outbox is looked at", () => {
    const store = ledger({ outboxReady: false, payments: [APPROVED_PAYMENT] });

    expect(cancel(store)).toEqual({ kind: "has_approved_payment" });
  });

  it("leaves the sale open and records nothing when appending the event fails", () => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = "appendOutboxEvent";

    expect(() => cancel(store)).toThrow("appendOutboxEvent failed");
    expect(store.state).toEqual(before);
  });

  it("keeps the sales already completed", () => {
    const store = ledger({ sales: [COMPLETED_SALE, OPEN_SALE] });

    cancel(store);

    expect(store.state.sales).toEqual([COMPLETED_SALE]);
  });

  it("discards a sale that has no lines", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [] }] });

    expect(cancel(store)).toEqual({ kind: "cancelled" });
    expect(store.state.sales).toEqual([]);
  });

  it("discards the open sale even when another actor opened it", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, actorId: "former" }] });

    expect(cancel(store)).toEqual({ kind: "cancelled" });
    expect(store.state.sales).toEqual([]);
  });

  it("refuses when there is no open sale, changing nothing", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, state: "COMPLETED" }] });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("does not cancel a sale of another session", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, sessionId: "session-0" }] });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "no_open_sale" });
    expect(store.state).toEqual(before);
  });

  it("refuses an actor without the permission", () => {
    const store = ledger({ accesses: { cashier: { isAdministrator: false, permissionKeys: [] } } });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("refuses without an open cash session", () => {
    expect(cancel(ledger({ session: undefined }))).toEqual({ kind: "no_open_session" });
  });

  it("refuses an actor who did not open the current session", () => {
    const store = ledger({ accesses: { cashier: CASHIER, other: CASHIER } });
    const before = structuredClone(store.state);

    expect(cancel(store, "other")).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("refuses a sale with an approved payment, changing nothing", () => {
    const store = ledger({ payments: [APPROVED_PAYMENT] });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "has_approved_payment" });
    expect(store.state).toEqual(before);
  });

  it("ignores the payments of another sale", () => {
    const store = ledger({ payments: [{ ...APPROVED_PAYMENT, saleId: "sale-0" }] });

    expect(cancel(store).kind).toBe("cancelled");
  });

  it("leaves the sale open when discarding it fails", () => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = "discardOpenSale";

    expect(() => cancel(store)).toThrow("discardOpenSale failed");
    expect(store.state).toEqual(before);
  });
});

describe("cancelSale with a terminal charge", () => {
  it("refuses while the terminal charge is pending, even past its wait, changing nothing", () => {
    const store = ledger({
      pendingMercadoPagoPayments: [
        {
          ...PENDING_POINT_TRANSACTION,
          id: "point-1",
          saleId: "sale-1",
          amount: 1000,
          occurredAt: new Date(NOW.getTime() - 600_000),
          waitEndsAt: new Date(NOW.getTime() - 1),
        },
      ],
    });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "mercado_pago_charge_in_progress" });
    expect(store.state).toEqual(before);
  });
});

describe("cancelSale with a QR charge", () => {
  it("refuses while the QR charge is in its wait, changing nothing", () => {
    const store = ledger({
      pendingMercadoPagoPayments: [pendingQrEndingAt(new Date(NOW.getTime() + 60_000))],
    });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "mercado_pago_charge_in_progress" });
    expect(store.state).toEqual(before);
  });

  it("keeps the sale, cancelled now, after the wait, so its pending QR payment stays known", () => {
    const pending = pendingQrEndingAt(new Date(NOW.getTime() - 1));
    const store = ledger({ pendingMercadoPagoPayments: [pending] });

    expect(cancel(store)).toEqual({ kind: "cancelled" });
    expect(store.state.sales).toEqual([{ ...OPEN_SALE, state: "CANCELLED", occurredAt: NOW }]);
    expect(store.state.pendingMercadoPagoPayments).toEqual([pending]);
    expect(store.state.outbox).toEqual([cancelledEvent()]);
  });

  it("answers that it is unavailable while the outbox is not ready, keeping the sale open", () => {
    const store = ledger({
      outboxReady: false,
      pendingMercadoPagoPayments: [pendingQrEndingAt(new Date(NOW.getTime() - 1))],
    });
    const before = structuredClone(store.state);

    expect(cancel(store)).toEqual({ kind: "unavailable" });
    expect(store.state).toEqual(before);
  });
});
