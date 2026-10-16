import type { AlertLevel } from "../../alerts/index.js";

export interface PendingRefundOfCancelledSale {
  refundId: string;
  saleId: string;
  locationId: string;
  origin: string;
  method: string;
  amount: number;
  openedAt: Date;
  confirmedAt: Date | null;
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
