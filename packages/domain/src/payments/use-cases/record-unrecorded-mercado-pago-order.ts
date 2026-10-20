import {
  type MercadoPagoOrderResult,
  paidAmountOfMercadoPagoOrder,
} from "../model/mercado-pago-order-result.js";
import { paidOrderDiscoveryWindowOpenFor } from "../model/paid-order-discovery.js";
import { latePaymentRefundOfUnrecordedOrder } from "../model/payment-refund.js";
import {
  awaitsUnrecordedOrder,
  type MercadoPagoOrderTransaction,
} from "../model/payment-transaction.js";
import type { MercadoPagoOrders, PaymentTransactionLane } from "./mercado-pago-order-ports.js";
import { recordCreatedMercadoPagoOrder } from "./record-mercado-pago-order-result.js";

export type UnrecordedMercadoPagoOrderSearch =
  | { kind: "recorded"; transaction: MercadoPagoOrderTransaction }
  | { kind: "not_found" }
  | { kind: "provider_unavailable" };

interface FoundOrder {
  orderId: string;
  result: MercadoPagoOrderResult;
}

export async function recordUnrecordedMercadoPagoOrder(
  lane: PaymentTransactionLane,
  mercadoPago: MercadoPagoOrders,
  transaction: MercadoPagoOrderTransaction,
  now: Date,
): Promise<UnrecordedMercadoPagoOrderSearch> {
  if (!awaitsUnrecordedOrder(transaction) || !paidOrderDiscoveryWindowOpenFor(transaction, now)) {
    return { kind: "not_found" };
  }
  const search = await mercadoPago.searchOrdersOfExternalReference(
    transaction.id,
    transaction.createdAt,
    transaction.expiresAt,
  );
  if (search.kind === "unavailable") {
    return { kind: "provider_unavailable" };
  }
  const recorded = search.orders.find(({ result }) => paidAmountOfMercadoPagoOrder(result) !== null);
  const kept = recorded ?? search.orders[0];
  if (kept === undefined) {
    return { kind: "not_found" };
  }
  const others = search.orders.filter((order) => order !== kept);
  return {
    kind: "recorded",
    transaction: await lane.inOneTransaction(async (atomic) => {
      await openRefundsOfPaidOrders(atomic, transaction, others, now);
      return recordCreatedMercadoPagoOrder(
        atomic,
        transaction,
        kept.orderId,
        kept.result,
        now,
        true,
      );
    }),
  };
}

async function openRefundsOfPaidOrders(
  lane: PaymentTransactionLane,
  transaction: MercadoPagoOrderTransaction,
  orders: readonly FoundOrder[],
  openedAt: Date,
): Promise<void> {
  for (const { orderId, result } of orders) {
    const paidAmount = paidAmountOfMercadoPagoOrder(result);
    if (paidAmount !== null) {
      await lane.openLatePaymentRefund(
        latePaymentRefundOfUnrecordedOrder(transaction, orderId, paidAmount),
        openedAt,
      );
    }
  }
}
