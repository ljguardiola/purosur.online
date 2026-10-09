import type { Clock } from "../../shared/index.js";
import type { MercadoPagoOrderResult } from "../model/mercado-pago-order-result.js";
import type {
  PaymentTransactionState,
  ProviderPaymentTransaction,
} from "../model/payment-transaction.js";

export class PaymentTransactionAlreadyRecorded extends Error {}

export interface PaymentTransactionOutcome {
  state: PaymentTransactionState;
  needsReview: boolean;
}

export interface PaymentTransactionReading {
  outcome: PaymentTransactionOutcome;
  readAt: Date;
}

export interface PaymentTransactionLane {
  recordedTransaction(
    registerId: string,
    paymentTransactionId: string,
  ): Promise<ProviderPaymentTransaction | null>;
  recordPendingTransaction(transaction: ProviderPaymentTransaction): Promise<void>;
  recordCreationAttempt(paymentTransactionId: string, expiresAt: Date): Promise<void>;
  recordCreationOutcomeUnknown(paymentTransactionId: string): Promise<void>;
  recordNeedsReview(paymentTransactionId: string): Promise<void>;
  recordExpired(paymentTransactionId: string): Promise<void>;
  recordOrderCreated(
    paymentTransactionId: string,
    providerOrderId: string,
    reading: PaymentTransactionReading | null,
  ): Promise<void>;
  recordOrderResult(
    paymentTransactionId: string,
    outcome: PaymentTransactionOutcome,
    readAt: Date,
  ): Promise<void>;
}

export interface PaymentTransactionLanes {
  inPaymentTransactionLane<TOutcome>(
    paymentTransactionId: string,
    work: (lane: PaymentTransactionLane) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface MercadoPagoQrOrderRequest {
  idempotencyKey: string;
  externalReference: string;
  amount: number;
  expiresAfterMinutes: number;
}

export type MercadoPagoOrderCreation =
  | { kind: "created"; orderId: string; result: MercadoPagoOrderResult }
  | { kind: "refused" }
  | { kind: "throttled" }
  | { kind: "unavailable" };

export type MercadoPagoOrderReading =
  | { kind: "read"; result: MercadoPagoOrderResult }
  | { kind: "unavailable" };

export interface MercadoPagoOrders {
  readonly longestCallMs: number;
  createQrOrder(request: MercadoPagoQrOrderRequest): Promise<MercadoPagoOrderCreation>;
  readOrder(orderId: string): Promise<MercadoPagoOrderReading>;
}

export interface MercadoPagoQrOrderPorts {
  lanes: PaymentTransactionLanes;
  mercadoPago: MercadoPagoOrders;
  clock: Clock;
}
