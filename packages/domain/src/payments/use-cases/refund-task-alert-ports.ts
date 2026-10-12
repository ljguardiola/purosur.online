import type { AlertLevel } from "../../alerts/index.js";

export interface PendingRefundOfCancelledSale {
  refundId: string;
  saleId: string;
  locationId: string;
  method: string;
  amount: number;
  openedAt: Date;
}

export interface RefundTaskAlertTransaction {
  lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert(): Promise<
    PendingRefundOfCancelledSale[]
  >;
  openRefundTaskAlert(
    refund: PendingRefundOfCancelledSale,
    level: AlertLevel,
    openedAt: Date,
  ): Promise<void>;
}

export interface RefundTaskAlertStore {
  transaction<TOutcome>(
    work: (tx: RefundTaskAlertTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
