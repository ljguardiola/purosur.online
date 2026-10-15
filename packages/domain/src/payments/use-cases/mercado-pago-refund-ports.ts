import type { Clock } from "../../shared/index.js";
import type { LatePaymentOfRefund } from "../model/mercado-pago-refund.js";
import type { MercadoPagoOrders, PaymentTransactionLanes } from "./mercado-pago-order-ports.js";
import type { RefundStoreTransaction } from "./refund-store.js";

export interface MercadoPagoRefundRecord {
  id: string;
  locationId: string;
  saleId: string;
  state: string;
  origin: string;
  method: string;
  amount: number;
  paymentAmount: number;
  refundedOfPayment: number;
  paymentTransactionId: string | null;
  orderId: string | null;
  originEventId: string | null;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  sentAt: Date | null;
  providerRefundId: string | null;
  attemptKey: string | null;
  lastRefusalReason: string | null;
}

export interface MercadoPagoRefundReference {
  refundId: string;
  locationId: string;
  method: string;
  origin: string;
  paymentTransactionId: string | null;
  confirmedAt: Date | null;
  lastRefusalReason: string | null;
}

export interface OriginCancellation {
  saleId: string;
}

export interface MercadoPagoRefundTransaction extends RefundStoreTransaction {
  lockMercadoPagoRefund(
    refundId: string,
    locationId: string,
  ): Promise<MercadoPagoRefundRecord | undefined>;
  cancellationOfEvent(originEventId: string): Promise<OriginCancellation | null>;
  latePaymentOfRefund(refundId: string): Promise<LatePaymentOfRefund | null>;
  recordRefundConfirmed(
    refundId: string,
    confirmedBy: string,
    confirmedAt: Date,
    attemptKey: string,
  ): Promise<void>;
  recordAttemptKey(refundId: string, attemptKey: string | null): Promise<void>;
  recordRefundSent(refundId: string, providerRefundId: string, sentAt: Date): Promise<void>;
  recordRefundRefusal(refundId: string, reason: string, refusedAt: Date): Promise<void>;
}

export interface MercadoPagoRefundStore {
  refundReference(
    refundId: string,
    locationId: string,
  ): Promise<MercadoPagoRefundReference | undefined>;
  confirmedPendingRefunds(): Promise<MercadoPagoRefundReference[]>;
  transaction<TOutcome>(
    work: (tx: MercadoPagoRefundTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface MercadoPagoRefundKeys {
  newRefundKey(): string;
}

export interface MercadoPagoRefundPorts {
  store: MercadoPagoRefundStore;
  lanes: PaymentTransactionLanes;
  mercadoPago: MercadoPagoOrders;
  refundKeys: MercadoPagoRefundKeys;
  clock: Clock;
}
