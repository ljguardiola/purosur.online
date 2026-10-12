import { PENDING_QR_TRANSACTION } from "@purosur/domain/payments/test-support";
import { describe, expect, it } from "vitest";
import type { SaleWithLines } from "../model/sale.js";
import { recordPendingMercadoPagoPayment } from "./record-pending-mercado-pago-payment.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const STARTED_AT = new Date("2026-10-09T12:00:00.000Z");
const WAIT_ENDS_AT = new Date("2026-10-09T12:03:00.000Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
  saleDiscount: null,
  lines: [
    {
      id: "line-1",
      productId: "yerba",
      productName: "Yerba 1 kg",
      saleUnit: "UNIT" as const,
      weightSource: null,
      quantity: 2,
      listUnitPrice: 2500,
      priceListId: "list-1",
      promotions: [],
      manualAdjustment: null,
      promotionId: null,
      discountAmount: 0,
      lineTotal: 5000,
    },
  ],
};
const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01", revision: 0 };

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    sales: [OPEN_SALE],
    thresholds: [THRESHOLD],
    ...state,
  });
}

function record(store: FakeSaleLedger, amount = 5000, actorId = "cashier") {
  return recordPendingMercadoPagoPayment(
    { ledger: store, ids: new SequentialIds() },
    { actorId, saleId: "sale-1", amount, occurredAt: STARTED_AT, waitEndsAt: WAIT_ENDS_AT },
  );
}

describe("recordPendingMercadoPagoPayment", () => {
  it("keeps a pending QR payment of the amount with the end of its wait and names it", () => {
    const store = ledger();

    expect(record(store, 3000)).toEqual({ kind: "recorded", paymentTransactionId: "id-1" });
    expect(store.state.pendingMercadoPagoPayments).toEqual([
      {
        ...PENDING_QR_TRANSACTION,
        id: "id-1",
        saleId: "sale-1",
        amount: 3000,
        occurredAt: STARTED_AT,
        waitEndsAt: WAIT_ENDS_AT,
      },
    ]);
    expect(store.transactions).toBe(1);
  });

  it("charges nothing yet: the sale stays open, with no approved payment nor event", () => {
    const store = ledger();

    record(store);

    expect(store.state.sales[0]?.state).toBe("OPEN");
    expect(store.state.payments).toEqual([]);
    expect(store.state.outbox).toEqual([]);
  });

  it("refuses an amount above what is left to pay, recording nothing", () => {
    const store = ledger();

    expect(record(store, 5001)).toEqual({ kind: "exceeds_pending", pending: 5000 });
    expect(store.state.pendingMercadoPagoPayments).toEqual([]);
  });

  it.each([0, -100, 12.5])("refuses the invalid amount %s, recording nothing", (amount) => {
    const store = ledger();

    expect(record(store, amount)).toEqual({ kind: "invalid_amount" });
    expect(store.state.pendingMercadoPagoPayments).toEqual([]);
  });

  it("passes on why the sale cannot be charged, recording nothing", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [] }] });

    expect(record(store)).toEqual({ kind: "empty_sale" });
    expect(store.state.pendingMercadoPagoPayments).toEqual([]);
  });

  it("refuses someone who may not sell, recording nothing", () => {
    const store = ledger();

    expect(record(store, 5000, "stranger")).toEqual({ kind: "not_permitted" });
    expect(store.state.pendingMercadoPagoPayments).toEqual([]);
  });

  it("refuses a second QR charge while another one of the sale is still in its wait", () => {
    const store = ledger({
      pendingMercadoPagoPayments: [
        {
          ...PENDING_QR_TRANSACTION,
          id: "earlier",
          saleId: "sale-1",
          amount: 1000,
          occurredAt: STARTED_AT,
          waitEndsAt: new Date("2026-10-09T12:01:00.000Z"),
        },
      ],
    });

    expect(record(store)).toEqual({ kind: "mercado_pago_charge_in_progress" });
    expect(store.state.pendingMercadoPagoPayments.map(({ id }) => id)).toEqual(["earlier"]);
  });

  it("starts a new QR charge once an earlier one's wait has ended, keeping that one pending", () => {
    const store = ledger({
      pendingMercadoPagoPayments: [
        {
          ...PENDING_QR_TRANSACTION,
          id: "earlier",
          saleId: "sale-1",
          amount: 1000,
          occurredAt: new Date("2026-10-09T11:50:00.000Z"),
          waitEndsAt: new Date("2026-10-09T11:53:00.000Z"),
        },
      ],
    });

    expect(record(store)).toEqual({ kind: "recorded", paymentTransactionId: "id-1" });
    expect(store.state.pendingMercadoPagoPayments.map(({ id }) => id)).toEqual(["earlier", "id-1"]);
  });

  it("leaves nothing behind when keeping the payment fails", () => {
    const store = ledger();
    store.failOn = "recordPendingMercadoPagoPayment";

    expect(() => record(store)).toThrow();
    expect(store.state.pendingMercadoPagoPayments).toEqual([]);
  });
});
