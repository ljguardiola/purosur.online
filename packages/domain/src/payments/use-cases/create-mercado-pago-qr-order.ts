import type { MercadoPagoOrderResult } from "../model/mercado-pago-order-result.js";
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
          createdAt,
          expiresAt: mercadoPagoOrderExpiresAt(createdAt),
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
      let result: MercadoPagoOrderResult | undefined;
      if (orderId === null) {
        const creation = await mercadoPago.createQrOrder({
          idempotencyKey: paymentTransactionId,
          externalReference: paymentTransactionId,
          amount,
          expiresAfterMinutes: MERCADO_PAGO_ORDER_EXPIRY_MINUTES,
        });
        if (creation.kind === "refused") {
          return { kind: "provider_refused" };
        }
        if (creation.kind === "unavailable") {
          return { kind: "provider_unavailable" };
        }
        orderId = creation.orderId;
        await lane.recordOrderCreated(paymentTransactionId, orderId);
        transaction = { ...transaction, providerOrderId: orderId };
        result = recorded === null ? creation.result : undefined;
      }

      if (result === undefined) {
        const reading = await mercadoPago.readOrder(orderId);
        if (reading.kind === "unavailable") {
          return { kind: "provider_unavailable" };
        }
        result = reading.result;
      }

      return {
        kind: "recorded",
        transaction: await recordMercadoPagoOrderResult(lane, transaction, result, clock.now()),
      };
    },
  );
}
