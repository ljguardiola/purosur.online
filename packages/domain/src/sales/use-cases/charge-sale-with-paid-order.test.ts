import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../fiscal/test-support/fictional-tax-identities.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { SaleWithLines } from "../model/sale.js";
import { chargeSaleWithPaidOrder } from "./charge-sale-with-paid-order.js";
import {
  aPointPaidOrder,
  aRebuildablePaidOrder,
  FakeSaleLedger,
  type FakeSaleLedgerState,
  type FakeSaleLedgerWrite,
  FixedClock,
  RESTORATION_IN_PROGRESS,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-10-30T12:34:56.789Z");
const IDENTITY = { registerId: "register-1", deviceId: "device-1" };
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const SESSION = { id: "session-1", openedBy: "cashier" };
const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01", revision: 0 };
const ISSUER = {
  legalName: FICTIONAL_LEGAL_NAME,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
  activityStartDate: "2020-01-15",
  authorizedCuit: FICTIONAL_CUIT,
  taxStatus: "Condicion de prueba",
  version: 2,
};
const BUYER_TAX_STATUSES = [{ code: 5, description: "Consumidor Final", invoiceClass: "A/M/C" }];

function saleWorth(total: number): SaleWithLines {
  return {
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
        quantity: 1,
        listUnitPrice: total,
        priceListId: "list-1",
        promotions: [],
        manualAdjustment: null,
        promotionId: null,
        discountAmount: 0,
        lineTotal: total,
      },
    ],
  };
}

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    identity: IDENTITY,
    session: SESSION,
    sales: [saleWorth(5000)],
    paidOrders: [aRebuildablePaidOrder({ amount: 5000 })],
    rebuiltSales: [{ saleId: "sale-1", paymentTransactionId: "order-1" }],
    issuerIdentifications: [ISSUER],
    buyerTaxStatusSets: [{ paramsVersion: 1, options: BUYER_TAX_STATUSES }],
    ...state,
  });
}

function chargeWithPaidOrder(store: FakeSaleLedger, saleId = "sale-1", actorId = "cashier") {
  return chargeSaleWithPaidOrder(
    {
      zoneRules: new FakeZoneRulesSource(),
      ledger: store,
      restoration: store.restoration,
      clock: new FixedClock(NOW),
      ids: new SequentialIds(),
    },
    { actorId, saleId },
  );
}

function refusedWith(store: FakeSaleLedger, saleId = "sale-1", actorId = "cashier") {
  const before = structuredClone(store.state);
  const outcome = chargeWithPaidOrder(store, saleId, actorId);
  expect(store.state).toEqual(before);
  return outcome;
}

function completedEvent(store: FakeSaleLedger) {
  return store.state.outbox.find(({ event_type }) => event_type === "sale_completed");
}

describe("chargeSaleWithPaidOrder", () => {
  describe("when the sale's total equals the paid amount", () => {
    it("records the paid order as an approved payment of its method under the order's id and completes the sale", () => {
      const store = ledger();

      const outcome = chargeWithPaidOrder(store);

      expect(outcome).toEqual({
        kind: "completed",
        saleId: "sale-1",
        total: 5000,
        applied: 5000,
        surplus: 0,
      });
      expect(store.state.payments).toEqual([
        {
          id: "order-1",
          saleId: "sale-1",
          kind: "SALE",
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount: 5000,
          state: "APPROVED",
          occurredAt: NOW,
        },
      ]);
      expect(store.state.sales[0]?.state).toBe("COMPLETED");
      expect(store.state.movements).toEqual([]);
    });

    it("sends the sale_completed event with the order's payment and no surplus", () => {
      const store = ledger();

      chargeWithPaidOrder(store);

      expect(completedEvent(store)).toMatchObject({
        schema_version: 10,
        payload: {
          total: 5000,
          payments: [{ id: "order-1", method: "QR", amount: 5000, state: "APPROVED" }],
          rebuilt_paid_order: { payment_transaction_id: "order-1", surplus: 0 },
        },
      });
    });

    it("authorizes the completed sale like any other, deciding its authorization once", () => {
      const store = ledger();

      chargeWithPaidOrder(store);

      expect(store.state.preEmissionGates).toHaveLength(1);
      expect(store.state.authorizationDecisions).toMatchObject([
        { saleId: "sale-1", total: 5000, decidedAt: NOW },
      ]);
      expect(store.state.lastOperationNumber).toBe(1);
    });

    it("records an integrated terminal order with its card type", () => {
      const store = ledger({
        paidOrders: [aPointPaidOrder({ amount: 5000, cardType: "CREDIT" })],
      });

      chargeWithPaidOrder(store);

      expect(store.state.payments).toMatchObject([
        { id: "order-1", method: "POINT", provider: "MERCADOPAGO_POINT", cardType: "CREDIT" },
      ]);
    });
  });

  describe("when the sale's total is above the paid amount", () => {
    it("applies the whole paid amount and leaves the remainder pending, without completing the sale", () => {
      const store = ledger({ paidOrders: [aRebuildablePaidOrder({ amount: 2000 })] });

      const outcome = chargeWithPaidOrder(store);

      expect(outcome).toEqual({
        kind: "partially_paid",
        saleId: "sale-1",
        total: 5000,
        paid: 2000,
        pending: 3000,
      });
      expect(store.state.payments).toMatchObject([
        { id: "order-1", method: "QR", amount: 2000, state: "APPROVED" },
      ]);
      expect(store.state.sales[0]?.state).toBe("OPEN");
      expect(store.state.outbox).toEqual([]);
      expect(store.state.lastOperationNumber).toBe(0);
    });
  });

  describe("when the sale's total is below the paid amount", () => {
    it("applies only the sale's total, completes the sale and reports the surplus, handing no cash change", () => {
      const store = ledger({ paidOrders: [aRebuildablePaidOrder({ amount: 8000 })] });

      const outcome = chargeWithPaidOrder(store);

      expect(outcome).toEqual({
        kind: "completed",
        saleId: "sale-1",
        total: 5000,
        applied: 5000,
        surplus: 3000,
      });
      expect(store.state.payments).toMatchObject([{ id: "order-1", amount: 5000 }]);
      expect(store.state.movements).toEqual([]);
      expect(completedEvent(store)).toMatchObject({
        payload: { rebuilt_paid_order: { payment_transaction_id: "order-1", surplus: 3000 } },
      });
    });
  });

  describe("refusals, which write nothing", () => {
    it("refuses a person who may not sell", () => {
      expect(refusedWith(ledger({ accesses: {} }))).toEqual({ kind: "not_permitted" });
    });

    it("refuses while the register is being restored", () => {
      expect(refusedWith(ledger({ restoration: RESTORATION_IN_PROGRESS }))).toEqual({
        kind: "restoration_in_progress",
      });
    });

    it("refuses without an open cash session", () => {
      expect(refusedWith(ledger({ session: undefined }))).toEqual({ kind: "no_open_session" });
    });

    it("refuses a sale that is not the open one", () => {
      expect(refusedWith(ledger(), "sale-2")).toEqual({ kind: "no_open_sale" });
    });

    it("refuses an empty sale", () => {
      const store = ledger({ sales: [{ ...saleWorth(5000), lines: [] }] });

      expect(refusedWith(store)).toEqual({ kind: "empty_sale" });
    });

    it("refuses a sale with nothing to charge", () => {
      expect(refusedWith(ledger({ sales: [saleWorth(0)] }))).toEqual({ kind: "zero_total" });
    });

    it("refuses a total that reaches the buyer identification threshold", () => {
      const store = ledger({
        sales: [saleWorth(10_000_000)],
        paidOrders: [aRebuildablePaidOrder({ amount: 10_000_000 })],
      });

      expect(refusedWith(store)).toEqual({
        kind: "reaches_buyer_identification_threshold",
        threshold: 10_000_000,
      });
    });

    it("refuses a sale that was not rebuilt against a paid order", () => {
      expect(refusedWith(ledger({ rebuiltSales: [] }))).toEqual({ kind: "no_paid_order" });
    });

    it("refuses when the paid order was already applied to the sale", () => {
      const store = ledger({
        paidOrders: [aRebuildablePaidOrder({ amount: 2000 })],
        payments: [
          {
            id: "order-1",
            saleId: "sale-1",
            kind: "SALE",
            method: "QR",
            provider: "MERCADOPAGO_QR",
            amount: 2000,
            state: "APPROVED",
            occurredAt: NOW,
          },
        ],
      });

      expect(refusedWith(store)).toEqual({ kind: "already_applied" });
    });

    it.each([
      "recordPayment",
      "recordCompletedSale",
      "appendOutboxEvent",
    ] satisfies FakeSaleLedgerWrite[])("leaves nothing behind when %s fails", (write) => {
      const store = ledger();
      store.failOn = write;
      const before = structuredClone(store.state);

      expect(() => chargeWithPaidOrder(store)).toThrow(`${write} failed`);

      expect(store.state).toEqual(before);
    });
  });
});
