import type { Clock } from "../../shared/index.js";
import type { MercadoPagoOrderResult } from "../model/mercado-pago-order-result.js";
import type {
  MercadoPagoOrderRefund,
  MercadoPagoRefundAnswer,
} from "../model/mercado-pago-refund.js";
import type { LatePaymentRefund } from "../model/payment-refund.js";
import type {
  MercadoPagoOrderTransaction,
  PaymentTransactionState,
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

export interface RecordedOrderState {
  state: PaymentTransactionState;
  replaced: boolean;
}

export type LatePaymentRefundOpening = "opened" | "already_open";

export interface PaymentTransactionLane {
  recordedTransaction(
    registerId: string,
    paymentTransactionId: string,
  ): Promise<MercadoPagoOrderTransaction | null>;
  paidOrderHeldBySale(paymentTransactionId: string): Promise<boolean>;
  recordPendingTransaction(transaction: MercadoPagoOrderTransaction): Promise<void>;
  recordCancelledWithoutOrder(transaction: MercadoPagoOrderTransaction): Promise<void>;
  recordCreationAttempt(paymentTransactionId: string, expiresAt: Date): Promise<void>;
  recordCreationCreatedNothing(paymentTransactionId: string): Promise<void>;
  recordNeedsReview(paymentTransactionId: string): Promise<void>;
  recordExpired(paymentTransactionId: string): Promise<void>;
  recordOrderCreated(
    paymentTransactionId: string,
    providerOrderId: string,
    reading: PaymentTransactionReading | null,
  ): Promise<RecordedOrderState>;
  recordNoOtherOrderPossible(paymentTransactionId: string): Promise<void>;
  recordOrderResult(
    paymentTransactionId: string,
    outcome: PaymentTransactionOutcome,
    readAt: Date,
  ): Promise<RecordedOrderState>;
  openLatePaymentRefund(
    refund: LatePaymentRefund,
    openedAt: Date,
  ): Promise<LatePaymentRefundOpening>;
  inOneTransaction<TOutcome>(
    work: (lane: PaymentTransactionLane) => Promise<TOutcome>,
  ): Promise<TOutcome>;
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
  externalPosId: string;
}

export interface MercadoPagoPointOrderRequest {
  idempotencyKey: string;
  externalReference: string;
  amount: number;
  expiresAfterMinutes: number;
  terminalId: string;
}

export type MercadoPagoOrderCreation =
  | { kind: "created"; orderId: string; result: MercadoPagoOrderResult }
  | { kind: "refused" }
  | { kind: "queued_order_on_terminal" }
  | { kind: "throttled" }
  | { kind: "unavailable" };

export type MercadoPagoOrderReading =
  | { kind: "read"; result: MercadoPagoOrderResult }
  | { kind: "unavailable" };

export type MercadoPagoOrderSearch =
  | {
      kind: "read";
      orders: readonly { orderId: string; result: MercadoPagoOrderResult }[];
    }
  | { kind: "unavailable" };

export type MercadoPagoOrderRefundsReading =
  | { kind: "read"; refunds: readonly MercadoPagoOrderRefund[] }
  | { kind: "unavailable" };

export type MercadoPagoOrderCancellation =
  | { kind: "cancelled"; result: MercadoPagoOrderResult }
  | { kind: "cannot_cancel" }
  | { kind: "unavailable" };

export interface MercadoPagoOrders {
  readonly longestCallMs: number;
  createQrOrder(request: MercadoPagoQrOrderRequest): Promise<MercadoPagoOrderCreation>;
  createPointOrder(request: MercadoPagoPointOrderRequest): Promise<MercadoPagoOrderCreation>;
  readOrder(orderId: string): Promise<MercadoPagoOrderReading>;
  searchOrdersOfExternalReference(
    externalReference: string,
    createdFrom: Date,
    createdTo: Date,
  ): Promise<MercadoPagoOrderSearch>;
  cancelOrder(orderId: string, idempotencyKey: string): Promise<MercadoPagoOrderCancellation>;
  refundOrder(orderId: string, idempotencyKey: string): Promise<MercadoPagoRefundAnswer>;
  readOrderRefunds(orderId: string): Promise<MercadoPagoOrderRefundsReading>;
}

export interface MercadoPagoCancellationKeys {
  newCancellationKey(): string;
}

export interface MercadoPagoOrderPorts {
  lanes: PaymentTransactionLanes;
  mercadoPago: MercadoPagoOrders;
  clock: Clock;
}

export interface PointTerminals {
  terminalOfRegister(registerId: string): Promise<string | null>;
}

export interface QrPointsOfSale {
  pointOfSaleOfRegister(registerId: string): Promise<string | null>;
}

export type MercadoPagoQrOrderPorts = MercadoPagoOrderPorts & {
  qrPointsOfSale: QrPointsOfSale;
};

export type MercadoPagoPointOrderPorts = MercadoPagoOrderPorts & {
  pointTerminals: PointTerminals;
};
