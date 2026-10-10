import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../fiscal/test-support/fictional-tax-identities.js";
import type { PendingQrSalePayment, SalePayment } from "../../payments/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { settleApprovedQrPayment } from "./settle-approved-qr-payment.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
  PENDING_QR_TRANSACTION,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const STARTED_AT = new Date("2026-10-09T12:00:00.000Z");
const APPROVED_AT = new Date("2026-10-09T12:01:30.000Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const TOTAL = 5000;
const OPEN_SALE: SaleWithLines = {
  id: "sale-1",
  registerId: "register-1",
  deviceId: "device-1",
  sessionId: "session-1",
  actorId: "cashier",
  state: "OPEN",
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
      promotionId: null,
      discountAmount: 0,
      lineTotal: TOTAL,
    },
  ],
};
const ISSUER = {
  legalName: FICTIONAL_LEGAL_NAME,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
  activityStartDate: "2020-01-15",
  authorizedCuit: FICTIONAL_CUIT,
  taxStatus: "Condicion de prueba",
  version: 2,
};
const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01", revision: 0 };
const BUYER_TAX_STATUSES = [{ code: 5, description: "Consumidor Final", invoiceClass: "A/M/C" }];

function pendingQr(amount: number): PendingQrSalePayment {
  return {
    ...PENDING_QR_TRANSACTION,
    id: "qr-1",
    saleId: "sale-1",
    amount,
    occurredAt: STARTED_AT,
    waitEndsAt: new Date("2026-10-09T12:03:00.000Z"),
  };
}

const APPROVED_QR: SalePayment = {
  id: "qr-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "QR",
  provider: "MERCADOPAGO_QR",
  amount: TOTAL,
  state: "APPROVED",
  occurredAt: STARTED_AT,
};

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    sales: [OPEN_SALE],
    pendingQrPayments: [pendingQr(TOTAL)],
    issuerIdentifications: [ISSUER],
    thresholds: [THRESHOLD],
    buyerTaxStatusSets: [{ paramsVersion: 1, options: BUYER_TAX_STATUSES }],
    ...state,
  });
}

function settle(store: FakeSaleLedger, paymentTransactionId = "qr-1", actorId = "cashier") {
  return settleApprovedQrPayment(
    { ledger: store, clock: new FixedClock(APPROVED_AT), ids: new SequentialIds() },
    { actorId, paymentTransactionId },
  );
}

describe("settleApprovedQrPayment", () => {
  it("approves the QR payment and completes the sale it covers, in one transaction", () => {
    const store = ledger();

    expect(settle(store)).toEqual({ kind: "completed", saleId: "sale-1", total: TOTAL });
    expect(store.state.payments).toEqual([APPROVED_QR]);
    expect(store.state.pendingQrPayments).toEqual([]);
    expect(store.state.sales[0]).toMatchObject({ state: "COMPLETED", occurredAt: APPROVED_AT });
    expect(store.transactions).toBe(1);
  });

  it("sends the approved QR payment in the sale_completed event", () => {
    const store = ledger();

    settle(store);

    expect(store.state.outbox).toHaveLength(1);
    expect(store.state.outbox[0]).toMatchObject({
      event_type: "sale_completed",
      payload: {
        payments: [
          {
            id: "qr-1",
            kind: "SALE",
            method: "QR",
            provider: "MERCADOPAGO_QR",
            amount: TOTAL,
            tendered: null,
            state: "APPROVED",
            occurred_at: STARTED_AT.toISOString(),
            authorized_by: null,
            confirmed_at: null,
          },
        ],
        cash_movements: [],
      },
    });
  });

  it("approves a QR payment that covers part of the sale and leaves the rest pending", () => {
    const store = ledger({ pendingQrPayments: [pendingQr(3000)] });

    expect(settle(store)).toEqual({
      kind: "partially_paid",
      saleId: "sale-1",
      total: TOTAL,
      paid: 3000,
      pending: 2000,
    });
    expect(store.state.payments).toEqual([{ ...APPROVED_QR, amount: 3000 }]);
    expect(store.state.sales[0]?.state).toBe("OPEN");
    expect(store.state.outbox).toEqual([]);
  });

  it("completes the sale when the QR payment covers what an earlier payment left", () => {
    const cash: SalePayment = {
      id: "cash-1",
      saleId: "sale-1",
      kind: "SALE",
      method: "CASH",
      provider: "NONE",
      amount: 2000,
      tendered: 2000,
      state: "APPROVED",
      occurredAt: STARTED_AT,
    };
    const store = ledger({ payments: [cash], pendingQrPayments: [pendingQr(3000)] });

    expect(settle(store)).toEqual({ kind: "completed", saleId: "sale-1", total: TOTAL });
  });

  it("answers that no QR payment is pending for an unknown or already settled one", () => {
    const store = ledger({ pendingQrPayments: [] });
    const before = structuredClone(store.state);

    expect(settle(store)).toEqual({ kind: "not_pending" });
    expect(store.state).toEqual(before);
  });

  it("passes on why the sale cannot be charged, leaving the QR payment pending", () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(settle(store, "qr-1", "stranger")).toEqual({ kind: "not_permitted" });
    expect(store.state).toEqual(before);
  });

  it("leaves the QR payment pending and the sale open when completing it fails", () => {
    const store = ledger();
    store.failOn = "appendOutboxEvent";
    const before = structuredClone(store.state);

    expect(() => settle(store)).toThrow();
    expect(store.state).toEqual(before);
  });
});
