export interface LockedRefund {
  id: string;
  state: string;
}

export interface PendingRefund {
  id: string;
  saleId: string;
  registerId: string;
  method: string;
  amount: number;
  occurredAt: Date;
  cancelledBy: string;
}

export interface PendingRefundsReader {
  pendingRefunds(locationId: string): Promise<PendingRefund[]>;
}

export interface RefundStore {
  transaction<TOutcome>(work: (tx: RefundStoreTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface RefundStoreTransaction {
  lockRefund(refundId: string, locationId: string): Promise<LockedRefund | undefined>;
  recordRefundDone(refundId: string, doneBy: string, doneAt: Date): Promise<void>;
}
