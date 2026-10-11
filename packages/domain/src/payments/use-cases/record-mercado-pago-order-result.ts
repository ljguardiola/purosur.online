import {
  applyMercadoPagoOrderResult,
  type MercadoPagoOrderResult,
} from "../model/mercado-pago-order-result.js";
import { latePaymentRefund } from "../model/payment-refund.js";
import {
  isLateApproval,
  type MercadoPagoQrOrderTransaction,
} from "../model/payment-transaction.js";
import type { PaymentTransactionLane, RecordedOrderState } from "./mercado-pago-qr-order-ports.js";

export async function openLatePaymentRefundIfLate(
  lane: PaymentTransactionLane,
  transaction: MercadoPagoQrOrderTransaction,
  recorded: RecordedOrderState,
  openedAt: Date,
): Promise<void> {
  if (isLateApproval(recorded)) {
    await lane.openLatePaymentRefund(latePaymentRefund(transaction), openedAt);
  }
}

export async function recordMercadoPagoOrderResult(
  lane: PaymentTransactionLane,
  transaction: MercadoPagoQrOrderTransaction,
  result: MercadoPagoOrderResult,
  readAt: Date,
): Promise<MercadoPagoQrOrderTransaction> {
  const outcome = applyMercadoPagoOrderResult(transaction, result);
  const recorded = await lane.inOneTransaction(async (atomic) => {
    const state = await atomic.recordOrderResult(transaction.id, outcome, readAt);
    await openLatePaymentRefundIfLate(atomic, transaction, state, readAt);
    return state;
  });
  return { ...transaction, ...outcome, replaced: recorded.replaced };
}

export async function recordCreatedMercadoPagoOrder(
  lane: PaymentTransactionLane,
  transaction: MercadoPagoQrOrderTransaction,
  providerOrderId: string,
  result: MercadoPagoOrderResult,
  readAt: Date,
): Promise<MercadoPagoQrOrderTransaction> {
  const withOrder = { ...transaction, providerOrderId };
  const outcome = applyMercadoPagoOrderResult(withOrder, result);
  const recorded = await lane.inOneTransaction(async (atomic) => {
    const state = await atomic.recordOrderCreated(transaction.id, providerOrderId, {
      outcome,
      readAt,
    });
    await openLatePaymentRefundIfLate(atomic, withOrder, state, readAt);
    return state;
  });
  return { ...withOrder, ...outcome, replaced: recorded.replaced };
}
