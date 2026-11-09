import type { MercadoPagoRefundStage } from "../model/mercado-pago-refund.js";
import type { PaymentMethod, PointCardType } from "../model/payment.js";
import type { RefundAlertKind, RefundOrigin } from "../model/payment-refund.js";
import type { RefundTransfer } from "../model/refund-transfer.js";

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
  cardType: PointCardType | null;
  origin: RefundOrigin;
  amount: number;
  occurredAt: Date;
  saleOccurredAt: Date;
  coveredBy: PaymentMethod[];
  ofRebuiltSale: boolean;
  providerOrderId: string | null;
  correctedBy: string | null;
  correctedByName: string | null;
  confirmedAt: Date | null;
  sentAt: Date | null;
  lastRefusalReason: string | null;
}

export interface PendingRefund extends PendingRefundRecord {
  discardable: boolean;
  transferable: boolean;
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
  recordRefundDoneByTransfer(
    refundId: string,
    transfer: RefundTransfer,
    doneBy: string,
    doneAt: Date,
  ): Promise<void>;
  recordRefundDiscarded(refundId: string, discardedBy: string, discardedAt: Date): Promise<void>;
  resolveRefundAlert(
    refundId: string,
    kind: RefundAlertKind,
    resolvedBy: string,
    resolvedAt: Date,
  ): Promise<void>;
}
