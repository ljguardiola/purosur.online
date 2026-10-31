import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { SaleWithLines } from "../model/sale.js";
import { chargeSaleByTransfer } from "./charge-sale-by-transfer.js";
import { chargeSaleInCash } from "./charge-sale-in-cash.js";
import { chargeSaleOnStandaloneTerminal } from "./charge-sale-on-standalone-terminal.js";
import { recordPendingMercadoPagoPayment } from "./record-pending-mercado-pago-payment.js";
import {
  aRebuildablePaidOrder,
  FakeSaleLedger,
  type FakeSaleLedgerState,
  FixedClock,
  SequentialIds,
} from "./test-support/fake-sale-ledger.js";

const NOW = new Date("2026-10-30T12:34:56.789Z");
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const THRESHOLD = { id: "threshold-1", amount: 10_000_000, validFrom: "2026-01-01", revision: 0 };
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
      quantity: 1,
      listUnitPrice: 5000,
      priceListId: "list-1",
      promotions: [],
      manualAdjustment: null,
      promotionId: null,
      discountAmount: 0,
      lineTotal: 5000,
    },
  ],
};
const APPLIED_ORDER = {
  id: "order-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "QR",
  provider: "MERCADOPAGO_QR",
  amount: 2000,
  state: "APPROVED",
  occurredAt: NOW,
} as const;

function ledger(state: Partial<FakeSaleLedgerState> = {}): FakeSaleLedger {
  return new FakeSaleLedger({
    thresholds: [THRESHOLD],
    accesses: { cashier: CASHIER },
    identity: { registerId: "register-1", deviceId: "device-1" },
    session: { id: "session-1", openedBy: "cashier" },
    sales: [OPEN_SALE],
    paidOrders: [aRebuildablePaidOrder({ amount: 2000 })],
    rebuiltSales: [{ saleId: "sale-1", paymentTransactionId: "order-1" }],
    ...state,
  });
}

function ports(store: FakeSaleLedger) {
  return {
    ledger: store,
    restoration: store.restoration,
    clock: new FixedClock(NOW),
    zoneRules: new FakeZoneRulesSource(),
    ids: new SequentialIds(),
  };
}

const CHARGES = {
  cash: (store: FakeSaleLedger) =>
    chargeSaleInCash(ports(store), { actorId: "cashier", saleId: "sale-1", tendered: 5000 }),
  transfer: (store: FakeSaleLedger) =>
    chargeSaleByTransfer(ports(store), { actorId: "cashier", saleId: "sale-1", amount: 5000 }),
  "standalone terminal": (store: FakeSaleLedger) =>
    chargeSaleOnStandaloneTerminal(ports(store), {
      actorId: "cashier",
      saleId: "sale-1",
      amount: 5000,
    }),
  "Mercado Pago QR": (store: FakeSaleLedger) =>
    recordPendingMercadoPagoPayment(ports(store), {
      actorId: "cashier",
      saleId: "sale-1",
      method: "QR",
      amount: 5000,
      occurredAt: NOW,
      waitEndsAt: new Date(NOW.getTime() + 180_000),
    }),
} as const;

describe.each(Object.entries(CHARGES))(
  "charging by %s a sale rebuilt against a paid order",
  (_name, charge) => {
    it("is refused, writing nothing, until the paid order is applied", () => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(charge(store)).toEqual({ kind: "paid_order_not_applied" });

      expect(store.state).toEqual(before);
    });

    it("is allowed once the paid order was applied", () => {
      const store = ledger({ payments: [APPLIED_ORDER] });

      expect(charge(store).kind).not.toBe("paid_order_not_applied");
    });

    it("is allowed on a sale that was not rebuilt against a paid order", () => {
      const store = ledger({ rebuiltSales: [] });

      expect(charge(store).kind).not.toBe("paid_order_not_applied");
    });
  },
);

describe("completing a rebuilt sale by another method after the paid order was applied", () => {
  it("sends the sale_completed event with the link and no surplus", () => {
    const store = ledger({ payments: [APPLIED_ORDER] });

    const outcome = CHARGES.cash(store);

    expect(outcome).toMatchObject({ kind: "completed", saleId: "sale-1" });
    expect(store.state.outbox[0]).toMatchObject({
      event_type: "sale_completed",
      schema_version: 10,
      payload: {
        payments: [
          { id: "order-1", amount: 2000 },
          { method: "CASH", amount: 3000 },
        ],
        rebuilt_paid_order: { payment_transaction_id: "order-1", surplus: 0 },
      },
    });
  });
});
