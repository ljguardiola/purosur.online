import {
  type MercadoPagoOrderResult,
  paidAmountOfMercadoPagoOrder,
} from "../model/mercado-pago-order-result.js";
import { latePaymentRefundOfUnrecordedOrder } from "../model/payment-refund.js";
import {
  awaitsUnrecordedOrder,
  type MercadoPagoQrOrderTransaction,
} from "../model/payment-transaction.js";
import type { MercadoPagoNotificationPorts } from "./mercado-pago-notification-ports.js";
import type { PaymentTransactionLane } from "./mercado-pago-qr-order-ports.js";
import { recordCreatedMercadoPagoOrder } from "./record-mercado-pago-order-result.js";
import { refreshMercadoPagoTransaction } from "./refresh-mercado-pago-transaction.js";

export interface ConfirmMercadoPagoOrderNotificationInput {
  providerOrderId: string;
}

export type ConfirmMercadoPagoOrderNotificationOutcome =
  | { kind: "refreshed"; transaction: MercadoPagoQrOrderTransaction }
  | { kind: "late_payment_of_other_order" }
  | { kind: "unknown_order" }
  | { kind: "provider_unavailable" };

export async function confirmMercadoPagoOrderNotification(
  { directory, lanes, mercadoPago, clock }: MercadoPagoNotificationPorts,
  { providerOrderId }: ConfirmMercadoPagoOrderNotificationInput,
): Promise<ConfirmMercadoPagoOrderNotificationOutcome> {
  const reference = await directory.paymentTransactionOfOrder(providerOrderId);
  if (reference === null) {
    return confirmOrderOfUnrecordedCreation(
      { directory, lanes, mercadoPago, clock },
      providerOrderId,
    );
  }
  return lanes.inPaymentTransactionLane<ConfirmMercadoPagoOrderNotificationOutcome>(
    reference.id,
    async (lane) => {
      const transaction = await lane.recordedTransaction(reference.registerId, reference.id);
      if (transaction === null) {
        return { kind: "unknown_order" };
      }
      return refreshMercadoPagoTransaction(lane, { mercadoPago, clock }, transaction);
    },
  );
}

async function confirmOrderOfUnrecordedCreation(
  { directory, lanes, mercadoPago, clock }: MercadoPagoNotificationPorts,
  providerOrderId: string,
): Promise<ConfirmMercadoPagoOrderNotificationOutcome> {
  if (!(await directory.anyPaymentTransactionMayHaveUnrecordedOrder())) {
    return { kind: "unknown_order" };
  }
  const reading = await mercadoPago.readOrder(providerOrderId);
  if (reading.kind === "unavailable") {
    return { kind: "provider_unavailable" };
  }
  const { externalReference } = reading.result;
  if (externalReference === null) {
    return { kind: "unknown_order" };
  }
  const reference = await directory.paymentTransactionOfExternalReference(externalReference);
  if (reference === null) {
    return { kind: "unknown_order" };
  }
  return lanes.inPaymentTransactionLane<ConfirmMercadoPagoOrderNotificationOutcome>(
    reference.id,
    async (lane) => {
      const transaction = await lane.recordedTransaction(reference.registerId, reference.id);
      if (transaction === null) {
        return { kind: "unknown_order" };
      }
      if (transaction.providerOrderId === providerOrderId) {
        return refreshMercadoPagoTransaction(lane, { mercadoPago, clock }, transaction);
      }
      if (transaction.providerOrderId !== null) {
        return openLatePaymentRefundOfOtherOrder(
          lane,
          transaction,
          providerOrderId,
          reading.result,
          clock.now(),
        );
      }
      if (!awaitsUnrecordedOrder(transaction)) {
        return { kind: "unknown_order" };
      }
      return {
        kind: "refreshed",
        transaction: await recordCreatedMercadoPagoOrder(
          lane,
          transaction,
          providerOrderId,
          reading.result,
          clock.now(),
          true,
        ),
      };
    },
  );
}

async function openLatePaymentRefundOfOtherOrder(
  lane: PaymentTransactionLane,
  transaction: MercadoPagoQrOrderTransaction,
  providerOrderId: string,
  result: MercadoPagoOrderResult,
  openedAt: Date,
): Promise<ConfirmMercadoPagoOrderNotificationOutcome> {
  const paidAmount = paidAmountOfMercadoPagoOrder(result);
  if (paidAmount === null) {
    return { kind: "unknown_order" };
  }
  await lane.openLatePaymentRefund(
    latePaymentRefundOfUnrecordedOrder(transaction, providerOrderId, paidAmount),
    openedAt,
  );
  return { kind: "late_payment_of_other_order" };
}
