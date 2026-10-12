import {
  type MercadoPagoOrderTransaction,
  type MercadoPagoQrPaymentTransaction,
  mercadoPagoOrderExpiresAt,
} from "../model/payment-transaction.js";
import {
  type MercadoPagoOrderCreation,
  type MercadoPagoOrderPorts,
  type MercadoPagoOrders,
  PaymentTransactionAlreadyRecorded,
} from "./mercado-pago-order-ports.js";
import { recordExpiryWithoutOrder } from "./record-expiry-without-order.js";
import {
  recordCreatedMercadoPagoOrder,
  recordMercadoPagoOrderResult,
} from "./record-mercado-pago-order-result.js";

export interface CreateMercadoPagoOrderInput {
  registerId: string;
  paymentTransactionId: string;
  saleId: string;
  amount: number;
}

export interface MercadoPagoOrderKind {
  identity: Pick<MercadoPagoQrPaymentTransaction, "method" | "provider">;
  lifetimeMinutes: number;
  isValidAmount(amount: number): boolean;
  create(
    mercadoPago: MercadoPagoOrders,
    request: {
      idempotencyKey: string;
      externalReference: string;
      amount: number;
      expiresAfterMinutes: number;
    },
  ): Promise<MercadoPagoOrderCreation>;
}

export type CreateMercadoPagoOrderOutcome =
  | { kind: "recorded"; transaction: MercadoPagoOrderTransaction }
  | { kind: "invalid_amount" }
  | { kind: "request_mismatch" }
  | { kind: "not_owned" }
  | { kind: "provider_refused" }
  | { kind: "provider_unavailable" };

export async function createMercadoPagoOrder(
  { lanes, mercadoPago, clock }: MercadoPagoOrderPorts,
  { registerId, paymentTransactionId, saleId, amount }: CreateMercadoPagoOrderInput,
  kind: MercadoPagoOrderKind,
): Promise<CreateMercadoPagoOrderOutcome> {
  if (!kind.isValidAmount(amount)) {
    return { kind: "invalid_amount" };
  }

  return lanes.inPaymentTransactionLane<CreateMercadoPagoOrderOutcome>(
    paymentTransactionId,
    async (lane) => {
      const recorded = await lane.recordedTransaction(registerId, paymentTransactionId);
      if (recorded !== null && (recorded.saleId !== saleId || recorded.amount !== amount)) {
        return { kind: "request_mismatch" };
      }

      let transaction: MercadoPagoOrderTransaction;
      if (recorded === null) {
        const createdAt = clock.now();
        transaction = {
          id: paymentTransactionId,
          registerId,
          saleId,
          kind: "SALE",
          ...kind.identity,
          amount,
          state: "PENDING",
          needsReview: false,
          providerOrderId: null,
          creationOutcomeUnknown: true,
          replaced: false,
          createdAt,
          expiresAt: mercadoPagoOrderExpiresAt(
            createdAt,
            kind.lifetimeMinutes,
            mercadoPago.longestCallMs,
          ),
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
          const expiresAt = mercadoPagoOrderExpiresAt(
            attemptStartedAt,
            kind.lifetimeMinutes,
            mercadoPago.longestCallMs,
          );
          await lane.recordCreationAttempt(paymentTransactionId, expiresAt);
          transaction = { ...transaction, expiresAt };
        }

        const creation = await kind.create(mercadoPago, {
          idempotencyKey: paymentTransactionId,
          externalReference: paymentTransactionId,
          amount,
          expiresAfterMinutes: kind.lifetimeMinutes,
        });
        const earlierAttemptMayHaveCreatedOrder = recorded?.creationOutcomeUnknown === true;
        if (creation.kind === "refused" || creation.kind === "throttled") {
          if (!earlierAttemptMayHaveCreatedOrder) {
            await lane.recordCreationCreatedNothing(paymentTransactionId);
          }
          return {
            kind: creation.kind === "refused" ? "provider_refused" : "provider_unavailable",
          };
        }
        if (creation.kind === "unavailable") {
          return { kind: "provider_unavailable" };
        }
        const createdOrderId = creation.orderId;
        orderId = createdOrderId;
        transaction = { ...transaction, providerOrderId: createdOrderId };

        if (recorded === null) {
          return {
            kind: "recorded",
            transaction: await recordCreatedMercadoPagoOrder(
              lane,
              transaction,
              createdOrderId,
              creation.result,
              clock.now(),
              false,
            ),
          };
        }
        await lane.inOneTransaction(async (atomic) => {
          await atomic.recordOrderCreated(paymentTransactionId, createdOrderId, null);
          if (!earlierAttemptMayHaveCreatedOrder) {
            await atomic.recordNoOtherOrderPossible(paymentTransactionId);
          }
        });
        transaction = { ...transaction, creationOutcomeUnknown: earlierAttemptMayHaveCreatedOrder };
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
