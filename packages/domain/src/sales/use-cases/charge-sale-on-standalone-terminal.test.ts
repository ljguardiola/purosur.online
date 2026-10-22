import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../fiscal/test-support/fictional-tax-identities.js";
import type { SaleWithLines } from "../model/sale.js";
import { chargeSaleOnStandaloneTerminal } from "./charge-sale-on-standalone-terminal.js";
import {
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-09-30T12:34:56.789Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const TOTAL = 5900;
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
    {
      id: "line-2",
      productId: "fideos",
      productName: "Fideos",
      saleUnit: "UNIT" as const,
      weightSource: null,
      quantity: 1,
      listUnitPrice: 900,
      priceListId: "list-1",
      promotions: [],
      manualAdjustment: null,
      promotionId: null,
      discountAmount: 0,
      lineTotal: 900,
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

const REPLACED_QR = {
  id: "qr-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "QR",
  provider: "MERCADOPAGO_QR",
  state: "PENDING",
  amount: 2000,
  occurredAt: new Date(NOW.getTime() - 120_000),
  waitEndsAt: new Date(NOW.getTime() - 30_000),
} as const;

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: SESSION,
    sales: [OPEN_SALE],
    issuerIdentifications: [ISSUER],
    thresholds: [THRESHOLD],
    buyerTaxStatusSets: [{ paramsVersion: 1, options: BUYER_TAX_STATUSES }],
    ...state,
  });
}

function charge(
  store: FakeSaleLedger,
  amount = TOTAL,
  saleId = "sale-1",
  actorId = "cashier",
  ids = new SequentialIds(),
) {
  return chargeSaleOnStandaloneTerminal(
    { ledger: store, restoration: store.restoration, clock: new FixedClock(NOW), ids },
    { actorId, saleId, amount },
  );
}

const STANDALONE_PAYMENT = {
  id: "id-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "STANDALONE_TERMINAL",
  provider: "EXTERNAL_TERMINAL",
  state: "APPROVED",
  occurredAt: NOW,
  authorizedBy: "cashier",
  confirmedAt: NOW,
} as const;

describe("chargeSaleOnStandaloneTerminal", () => {
  it("completes the sale and reports its total", () => {
    const store = ledger();

    expect(charge(store)).toEqual({ kind: "completed", saleId: "sale-1", total: TOTAL });
    expect(store.state.sales[0]?.state).toBe("COMPLETED");
    expect(store.transactions).toBe(1);
  });

  it("records one approved standalone terminal payment of the whole total, with who confirmed it and when", () => {
    const store = ledger();

    charge(store);

    expect(store.state.payments).toEqual([{ ...STANDALONE_PAYMENT, amount: TOTAL }]);
  });

  it("confirms with the signed-in actor and the clock's now, whoever opened the sale", () => {
    const store = ledger({
      accesses: { cashier: CASHIER, closer: CASHIER },
      sales: [{ ...OPEN_SALE, actorId: "closer" }],
      session: { id: "session-1", openedBy: "closer" },
    });

    charge(store, TOTAL, "sale-1", "closer");

    expect(store.state.payments[0]).toMatchObject({
      authorizedBy: "closer",
      confirmedAt: NOW,
      occurredAt: NOW,
    });
  });

  it("sends the payment with who confirmed it and when in the sale_completed event, with no cash movements", () => {
    const store = ledger();

    charge(store);

    expect(store.state.outbox).toHaveLength(1);
    expect(store.state.outbox[0]).toMatchObject({
      event_type: "sale_completed",
      schema_version: 8,
      payload: {
        total: TOTAL,
        payments: [
          {
            id: "id-1",
            kind: "SALE",
            method: "STANDALONE_TERMINAL",
            provider: "EXTERNAL_TERMINAL",
            amount: TOTAL,
            tendered: null,
            state: "APPROVED",
            occurred_at: NOW.toISOString(),
            authorized_by: "cashier",
            confirmed_at: NOW.toISOString(),
          },
        ],
        cash_movements: [],
      },
    });
  });

  it("records a stock movement per line when the sale completes", () => {
    const store = ledger();

    charge(store);

    expect(store.state.stockMovements).toHaveLength(2);
  });

  it("completes the sale beside a pending QR payment marked as replaced", () => {
    const store = ledger({
      pendingMercadoPagoPayments: [REPLACED_QR],
      replacedQrPaymentIds: ["qr-1"],
    });

    expect(charge(store)).toMatchObject({ kind: "completed", saleId: "sale-1" });
    expect(store.state.payments.map(({ method }) => method)).toEqual(["STANDALONE_TERMINAL"]);
  });

  it("refuses to charge, recording nothing, while a Mercado Pago charge is in progress", () => {
    const store = ledger({
      pendingMercadoPagoPayments: [
        { ...REPLACED_QR, waitEndsAt: new Date(NOW.getTime() + 60_000) },
      ],
    });

    expect(charge(store)).toEqual({ kind: "mercado_pago_charge_in_progress" });
    expect(store.state.payments).toEqual([]);
    expect(store.state.sales[0]?.state).toBe("OPEN");
  });

  it("touches no Mercado Pago payment of the sale", () => {
    const store = ledger();

    charge(store);

    expect(store.state.pendingMercadoPagoPayments).toEqual([]);
  });

  it("refuses a sale without lines", () => {
    const store = ledger({ sales: [{ ...OPEN_SALE, lines: [] }] });

    expect(charge(store)).toEqual({ kind: "empty_sale" });
    expect(store.state.payments).toEqual([]);
  });

  it("refuses when the session has no open sale", () => {
    expect(charge(ledger({ sales: [] }))).toEqual({ kind: "no_open_sale" });
  });

  it("refuses a user who cannot sell and charge", () => {
    const store = ledger({ accesses: { cashier: { isAdministrator: false, permissionKeys: [] } } });

    expect(charge(store)).toEqual({ kind: "not_permitted" });
    expect(store.state.payments).toEqual([]);
  });

  it("refuses when no cash session is open", () => {
    expect(charge(ledger({ session: undefined }))).toEqual({ kind: "no_open_session" });
  });

  it.each<FakeSaleLedgerWrite>([
    "recordPayment",
    "takeOperationNumber",
    "recordCompletedSale",
    "appendOutboxEvent",
    "recordPreEmissionGate",
  ])("leaves nothing behind when %s fails", (write) => {
    const store = ledger();
    const before = structuredClone(store.state);
    store.failOn = write;

    expect(() => charge(store)).toThrow("failed");
    expect(store.state).toEqual(before);
  });

  describe("when the amount is below the pending balance", () => {
    const PARTIAL = 2000;

    it("leaves the sale open, reports what is paid and pending and records that amount", () => {
      const store = ledger();

      expect(charge(store, PARTIAL)).toEqual({
        kind: "partially_paid",
        saleId: "sale-1",
        total: TOTAL,
        paid: PARTIAL,
        pending: TOTAL - PARTIAL,
      });
      expect(store.state.sales[0]?.state).toBe("OPEN");
      expect(store.state.payments).toEqual([{ ...STANDALONE_PAYMENT, amount: PARTIAL }]);
      expect(store.state.outbox).toEqual([]);
    });

    it("completes with both payments when a second one covers exactly what is pending", () => {
      const store = ledger();
      const ids = new SequentialIds();
      charge(store, PARTIAL, "sale-1", "cashier", ids);

      expect(charge(store, TOTAL - PARTIAL, "sale-1", "cashier", ids)).toEqual({
        kind: "completed",
        saleId: "sale-1",
        total: TOTAL,
      });
      expect(store.state.outbox[0]?.payload).toMatchObject({
        payments: [
          { id: "id-1", method: "STANDALONE_TERMINAL", amount: PARTIAL },
          { id: "id-2", method: "STANDALONE_TERMINAL", amount: TOTAL - PARTIAL },
        ],
      });
    });
  });

  describe("when the amount is not payable", () => {
    it("refuses an amount above the pending balance with the pending balance and writes nothing", () => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(charge(store, TOTAL + 1)).toEqual({ kind: "exceeds_pending", pending: TOTAL });
      expect(store.state).toEqual(before);
    });

    it.each([0, -100, 0.5, Number.NaN])(
      "refuses the amount %s as invalid and writes nothing",
      (amount) => {
        const store = ledger();
        const before = structuredClone(store.state);

        expect(charge(store, amount)).toEqual({ kind: "invalid_amount" });
        expect(store.state).toEqual(before);
      },
    );
  });
});
