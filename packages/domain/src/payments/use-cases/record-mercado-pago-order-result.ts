import {
  applyMercadoPagoOrderResult,
  type MercadoPagoOrderResult,
} from "../model/mercado-pago-order-result.js";
import { latePaymentRefund } from "../model/payment-refund.js";
import { isLateApproval, type MercadoPagoOrderTransaction } from "../model/payment-transaction.js";
import type { PaymentTransactionLane, RecordedOrderState } from "./mercado-pago-order-ports.js";

async function openLatePaymentRefundIfLate(
  lane: PaymentTransactionLane,
  transaction: MercadoPagoOrderTransaction,
  recorded: RecordedOrderState,
  openedAt: Date,
): Promise<void> {
  if (isLateApproval(recorded)) {
    await lane.openLatePaymentRefund(latePaymentRefund(transaction), openedAt);
  }
}

export async function recordMercadoPagoOrderResult(
  lane: PaymentTransactionLane,
  transaction: MercadoPagoOrderTransaction,
  result: MercadoPagoOrderResult,
  readAt: Date,
): Promise<MercadoPagoOrderTransaction> {
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
  transaction: MercadoPagoOrderTransaction,
  providerOrderId: string,
  result: MercadoPagoOrderResult,
  readAt: Date,
  otherOrderPossible: boolean,
): Promise<MercadoPagoOrderTransaction> {
  const withOrder = { ...transaction, providerOrderId };
  const outcome = applyMercadoPagoOrderResult(withOrder, result);
  const recorded = await lane.inOneTransaction(async (atomic) => {
    const state = await atomic.recordOrderCreated(transaction.id, providerOrderId, {
      outcome,
      readAt,
    });
    if (!otherOrderPossible) {
      await atomic.recordNoOtherOrderPossible(transaction.id);
    }
    await openLatePaymentRefundIfLate(atomic, withOrder, state, readAt);
    return state;
  });
  return {
    ...withOrder,
    ...outcome,
    creationOutcomeUnknown: otherOrderPossible,
    replaced: recorded.replaced,
  };
}
