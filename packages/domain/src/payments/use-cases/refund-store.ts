import type { AlertKind } from "../../alerts/index.js";
import type { MercadoPagoRefundStage } from "../model/mercado-pago-refund.js";
import type { PaymentMethod } from "../model/payment.js";
import type { RefundOrigin } from "../model/payment-refund.js";

export interface LockedRefund {
  id: string;
  state: string;
  origin: string;
  method: string;
  confirmedAt: Date | null;
  lastRefusalReason: string | null;
}

export interface PendingRefundRecord {
  id: string;
  saleId: string;
  registerId: string;
  registerName: string;
  method: string;
  origin: RefundOrigin;
  amount: number;
  occurredAt: Date;
  saleOccurredAt: Date;
  coveredBy: PaymentMethod[];
  providerOrderId: string | null;
  cancelledBy: string | null;
  cancelledByName: string | null;
  confirmedAt: Date | null;
  sentAt: Date | null;
  lastRefusalReason: string | null;
}

export interface PendingRefund extends PendingRefundRecord {
  discardable: boolean;
  sentByCloud: boolean;
  deliveryStage: MercadoPagoRefundStage | null;
  secondsPending: number;
}

export interface PendingRefundsReader {
  pendingRefunds(locationId: string): Promise<PendingRefundRecord[]>;
}

export interface RefundStore {
  transaction<TOutcome>(work: (tx: RefundStoreTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface RefundStoreTransaction {
  lockRefund(refundId: string, locationId: string): Promise<LockedRefund | undefined>;
  recordRefundDone(refundId: string, doneBy: string, doneAt: Date): Promise<void>;
  recordRefundDiscarded(refundId: string, discardedBy: string, discardedAt: Date): Promise<void>;
  resolveRefundAlert(
    refundId: string,
    kind: AlertKind,
    resolvedBy: string,
    resolvedAt: Date,
  ): Promise<void>;
}
