import { applyMercadoPagoOrderResult } from "../model/mercado-pago-order-result.js";
import {
  isValidOrderAmount,
  MERCADO_PAGO_ORDER_EXPIRY_MINUTES,
  mercadoPagoOrderExpiresAt,
  type ProviderPaymentTransaction,
} from "../model/payment-transaction.js";
import {
  type MercadoPagoQrOrderPorts,
  PaymentTransactionAlreadyRecorded,
} from "./mercado-pago-qr-order-ports.js";
import { recordExpiryWithoutOrder } from "./record-expiry-without-order.js";
import { recordMercadoPagoOrderResult } from "./record-mercado-pago-order-result.js";

export interface CreateMercadoPagoQrOrderInput {
  registerId: string;
  paymentTransactionId: string;
  saleId: string;
  amount: number;
}

export type CreateMercadoPagoQrOrderOutcome =
  | { kind: "recorded"; transaction: ProviderPaymentTransaction }
  | { kind: "invalid_amount" }
  | { kind: "request_mismatch" }
  | { kind: "not_owned" }
  | { kind: "provider_refused" }
  | { kind: "provider_unavailable" };

export async function createMercadoPagoQrOrder(
  { lanes, mercadoPago, clock }: MercadoPagoQrOrderPorts,
  { registerId, paymentTransactionId, saleId, amount }: CreateMercadoPagoQrOrderInput,
): Promise<CreateMercadoPagoQrOrderOutcome> {
  if (!isValidOrderAmount(amount)) {
    return { kind: "invalid_amount" };
  }

  return lanes.inPaymentTransactionLane<CreateMercadoPagoQrOrderOutcome>(
    paymentTransactionId,
    async (lane) => {
      const recorded = await lane.recordedTransaction(registerId, paymentTransactionId);
      if (recorded !== null && (recorded.saleId !== saleId || recorded.amount !== amount)) {
        return { kind: "request_mismatch" };
      }

      let transaction: ProviderPaymentTransaction;
      if (recorded === null) {
        const createdAt = clock.now();
        transaction = {
          id: paymentTransactionId,
          registerId,
          saleId,
          kind: "SALE",
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount,
          state: "PENDING",
          needsReview: false,
          providerOrderId: null,
          creationOutcomeUnknown: false,
          createdAt,
          expiresAt: mercadoPagoOrderExpiresAt(createdAt, mercadoPago.longestCallMs),
        };
        try {
          await lane.recordPendingTransaction(transaction);
        } catch (error) {
          if (error instanceof PaymentTransactionAlreadyRecorded) {
            return { kind: "not_owned" };
          }
          throw error;
        }
      } else {
        transaction = recorded;
      }

      if (transaction.state !== "PENDING") {
        return { kind: "recorded", transaction };
      }

      let orderId = transaction.providerOrderId;
      if (orderId === null) {
        if (recorded !== null) {
          const attemptStartedAt = clock.now();
          const ended = await recordExpiryWithoutOrder(lane, transaction, attemptStartedAt);
          if (ended !== null) {
            return { kind: "recorded", transaction: ended };
          }
          const expiresAt = mercadoPagoOrderExpiresAt(attemptStartedAt, mercadoPago.longestCallMs);
          await lane.recordCreationAttempt(paymentTransactionId, expiresAt);
          transaction = { ...transaction, expiresAt };
        }

        const creation = await mercadoPago.createQrOrder({
          idempotencyKey: paymentTransactionId,
          externalReference: paymentTransactionId,
          amount,
          expiresAfterMinutes: MERCADO_PAGO_ORDER_EXPIRY_MINUTES,
        });
        if (creation.kind === "refused") {
          return { kind: "provider_refused" };
        }
        if (creation.kind === "throttled") {
          return { kind: "provider_unavailable" };
        }
        if (creation.kind === "unavailable") {
          await lane.recordCreationOutcomeUnknown(paymentTransactionId);
          return { kind: "provider_unavailable" };
        }
        orderId = creation.orderId;
        transaction = { ...transaction, providerOrderId: orderId };

        if (recorded === null) {
          const outcome = applyMercadoPagoOrderResult(transaction, creation.result);
          await lane.recordOrderCreated(paymentTransactionId, orderId, {
            outcome,
            readAt: clock.now(),
          });
          return { kind: "recorded", transaction: { ...transaction, ...outcome } };
        }
        await lane.recordOrderCreated(paymentTransactionId, orderId, null);
      }

      const reading = await mercadoPago.readOrder(orderId);
      if (reading.kind === "unavailable") {
        return { kind: "provider_unavailable" };
      }

      return {
        kind: "recorded",
        transaction: await recordMercadoPagoOrderResult(
          lane,
          transaction,
          reading.result,
          clock.now(),
        ),
      };
    },
  );
}
