import type { MercadoPagoOrderResult } from "../../model/mercado-pago-order-result.js";
import type { ProviderPaymentTransaction } from "../../model/payment-transaction.js";
import type {
  MercadoPagoOrderCreation,
  MercadoPagoOrderReading,
} from "../mercado-pago-qr-order-ports.js";
import { FakeMercadoPagoOrders } from "./fake-mercado-pago-orders.js";
import { FakePaymentTransactionDirectory } from "./fake-payment-transaction-directory.js";
import { FakePaymentTransactionLanes } from "./fake-payment-transaction-lanes.js";
import { FixedClock } from "./fake-refund-store.js";

export const NOW = new Date("2026-10-09T12:00:00.000Z");
export const REGISTER_ID = "register-1";
export const TRANSACTION_ID = "transaction-1";
export const SALE_ID = "sale-1";
export const AMOUNT = 2500;

export function orderResult(
  overrides: Partial<MercadoPagoOrderResult> = {},
): MercadoPagoOrderResult {
  return {
    status: "created",
    statusDetail: "created",
    totalPaidAmount: null,
    payments: [],
    ...overrides,
  };
}

export function paidOrderResult(paid = AMOUNT): MercadoPagoOrderResult {
  return orderResult({
    status: "processed",
    statusDetail: "accredited",
    totalPaidAmount: paid,
    payments: [{ status: "processed", statusDetail: "accredited", paidAmount: paid }],
  });
}

export function storedTransaction(
  overrides: Partial<ProviderPaymentTransaction> = {},
): ProviderPaymentTransaction {
  return {
    id: TRANSACTION_ID,
    registerId: REGISTER_ID,
    saleId: SALE_ID,
    kind: "SALE",
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount: AMOUNT,
    state: "PENDING",
    needsReview: false,
    providerOrderId: null,
    creationOutcomeUnknown: false,
    createdAt: new Date("2026-10-09T11:59:00.000Z"),
    expiresAt: new Date("2026-10-09T12:04:00.000Z"),
    ...overrides,
  };
}

export function mercadoPagoQrOrderWorld(
  answers: { creation?: MercadoPagoOrderCreation; reading?: MercadoPagoOrderReading } = {},
  now: Date = NOW,
) {
  const lanes = new FakePaymentTransactionLanes();
  const mercadoPago = new FakeMercadoPagoOrders(lanes, {
    creation: answers.creation ?? { kind: "created", orderId: "order-1", result: orderResult() },
    reading: answers.reading ?? { kind: "read", result: orderResult() },
  });
  const directory = new FakePaymentTransactionDirectory(lanes);
  return {
    lanes,
    mercadoPago,
    directory,
    ports: { lanes, mercadoPago, clock: new FixedClock(now) },
    notificationPorts: { directory, lanes, mercadoPago, clock: new FixedClock(now) },
  };
}
