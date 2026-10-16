import type { RefundedPaymentTransaction } from "../../model/mercado-pago-refund.js";
import type { MercadoPagoRefundPorts } from "../mercado-pago-refund-ports.js";
import { FakeMercadoPagoOrders } from "./fake-mercado-pago-orders.js";
import { FakeMercadoPagoRefundKeys } from "./fake-mercado-pago-refund-keys.js";
import {
  FakeMercadoPagoRefundStore,
  type FakeMercadoPagoStoredRefund,
} from "./fake-mercado-pago-refund-store.js";
import { FakePaymentTransactionLanes } from "./fake-payment-transaction-lanes.js";
import { FixedClock } from "./fake-refund-store.js";

export const NOW = new Date("2026-10-13T15:00:00.000Z");
const CONFIRMED_AT = new Date("2026-10-13T14:00:00.000Z");
export const SENT_AT = new Date("2026-10-13T14:00:02.000Z");

export function aQrRefundOfCancelledSale(
  overrides: Partial<FakeMercadoPagoStoredRefund> = {},
): FakeMercadoPagoStoredRefund {
  return {
    id: "refund-1",
    locationId: "branch-1",
    saleId: "sale-1",
    state: "PENDING",
    origin: "sale_cancelled",
    method: "QR",
    amount: 2450,
    ownOrderId: null,
    salePaymentAmount: 2450,
    refundedOfSalePayment: 0,
    paymentTransaction: aPaymentTransaction(),
    refundedOfPaymentTransactionByOrder: [],
    paymentTransactionId: "transaction-1",
    originEventId: "event-1",
    confirmedBy: null,
    confirmedAt: null,
    sentAt: null,
    providerRefundId: null,
    attemptKey: null,
    lastRefusalReason: null,
    ...overrides,
  };
}

export function aQrRefundOfLatePayment(
  overrides: Partial<FakeMercadoPagoStoredRefund> = {},
): FakeMercadoPagoStoredRefund {
  return aQrRefundOfCancelledSale({ origin: "late_payment", originEventId: null, ...overrides });
}

export function aPaymentTransaction(
  overrides: Partial<RefundedPaymentTransaction> = {},
): RefundedPaymentTransaction {
  return { orderId: "ORD-1", amount: 2450, state: "APPROVED", ...overrides };
}

export function aConfirmedRefund(
  overrides: Partial<FakeMercadoPagoStoredRefund> = {},
): FakeMercadoPagoStoredRefund {
  return aQrRefundOfCancelledSale({
    confirmedBy: "manager",
    confirmedAt: CONFIRMED_AT,
    attemptKey: "refund-key-0",
    ...overrides,
  });
}

export function aSentRefund(
  overrides: Partial<FakeMercadoPagoStoredRefund> = {},
): FakeMercadoPagoStoredRefund {
  return aConfirmedRefund({ sentAt: SENT_AT, providerRefundId: "REF-1", ...overrides });
}

export function refundWorld(refunds: FakeMercadoPagoStoredRefund[] = [aQrRefundOfCancelledSale()]) {
  const lanes = new FakePaymentTransactionLanes();
  const store = new FakeMercadoPagoRefundStore(refunds, lanes.operations);
  store.cancellations.set("event-1", "sale-1");
  const mercadoPago = new FakeMercadoPagoOrders(lanes, {
    creation: { kind: "unavailable" },
    pointCreation: { kind: "unavailable" },
    reading: { kind: "unavailable" },
  });
  const refundKeys = new FakeMercadoPagoRefundKeys();
  const ports: MercadoPagoRefundPorts = {
    store,
    lanes,
    mercadoPago,
    refundKeys,
    clock: new FixedClock(NOW),
  };
  return { ports, store, lanes, mercadoPago, refundKeys };
}
