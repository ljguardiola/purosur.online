import {
  type MercadoPagoOrderTransaction,
  type MercadoPagoPointPaymentTransaction,
  type MercadoPagoQrPaymentTransaction,
  mercadoPagoOrderExpiresAt,
} from "../model/payment-transaction.js";
import {
  type MercadoPagoOrderCreation,
  type MercadoPagoOrderPorts,
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

type MercadoPagoOrderIdentity =
  | Pick<MercadoPagoQrPaymentTransaction, "method" | "provider">
  | Pick<MercadoPagoPointPaymentTransaction, "method" | "provider">;

type MercadoPagoOrderAttempt<TNotCreated extends { kind: string }> =
  | MercadoPagoOrderCreation
  | { kind: "not_created"; outcome: TNotCreated };

export interface MercadoPagoOrderKind<
  TRefusal extends { kind: string },
  TNotCreated extends { kind: string },
  TPorts extends MercadoPagoOrderPorts = MercadoPagoOrderPorts,
> {
  identity: MercadoPagoOrderIdentity;
  lifetimeMinutes: number;
  refuseAmount(amount: number): TRefusal | null;
  create(
    ports: TPorts,
    registerId: string,
    request: {
      idempotencyKey: string;
      externalReference: string;
      amount: number;
      expiresAfterMinutes: number;
    },
  ): Promise<MercadoPagoOrderAttempt<TNotCreated>>;
}

export type CreateMercadoPagoOrderOutcome<
  TRefusal extends { kind: string },
  TNotCreated extends { kind: string },
> =
  | { kind: "recorded"; transaction: MercadoPagoOrderTransaction }
  | { kind: "request_mismatch" }
  | { kind: "not_owned" }
  | { kind: "provider_refused" }
  | { kind: "provider_unavailable" }
  | TRefusal
  | TNotCreated;

export async function createMercadoPagoOrder<
  TRefusal extends { kind: string },
  TNotCreated extends { kind: string },
  TPorts extends MercadoPagoOrderPorts,
>(
  ports: TPorts,
  { registerId, paymentTransactionId, saleId, amount }: CreateMercadoPagoOrderInput,
  kind: MercadoPagoOrderKind<TRefusal, TNotCreated, TPorts>,
): Promise<CreateMercadoPagoOrderOutcome<TRefusal, TNotCreated>> {
  const { lanes, mercadoPago, clock } = ports;
  const refusal = kind.refuseAmount(amount);
  if (refusal !== null) {
    return refusal;
  }

  return lanes.inPaymentTransactionLane<CreateMercadoPagoOrderOutcome<TRefusal, TNotCreated>>(
    paymentTransactionId,
    async (lane) => {
      const recorded = await lane.recordedTransaction(registerId, paymentTransactionId);
      if (
        recorded !== null &&
        (recorded.saleId !== saleId ||
          recorded.amount !== amount ||
          recorded.method !== kind.identity.method)
      ) {
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

        const attempt = await kind.create(ports, registerId, {
          idempotencyKey: paymentTransactionId,
          externalReference: paymentTransactionId,
          amount,
          expiresAfterMinutes: kind.lifetimeMinutes,
        });
        const earlierAttemptMayHaveCreatedOrder = recorded?.creationOutcomeUnknown === true;
        if (attempt.kind === "not_created") {
          if (!earlierAttemptMayHaveCreatedOrder) {
            await lane.recordCreationCreatedNothing(paymentTransactionId);
          }
          return attempt.outcome;
        }
        const creation = attempt;
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
