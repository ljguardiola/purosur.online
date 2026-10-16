import type { AlertLevel } from "../../../alerts/index.js";
import type {
  PendingRefundOfCancelledSale,
  RefundTaskAlertStore,
  RefundTaskAlertTransaction,
} from "../refund-task-alert-ports.js";

export interface FakeRefundOfSale extends PendingRefundOfCancelledSale {
  hasOpenRefundTaskAlert: boolean;
}

export interface OpenedRefundTaskAlert {
  refundId: string;
  saleId: string;
  locationId: string;
  method: string;
  amount: number;
  refundOpenedAt: Date;
  level: AlertLevel;
  openedAt: Date;
}

type RefundTaskAlertStep = "lockRefunds" | "openRefundTaskAlert";

class FakeRefundTaskAlertTransaction implements RefundTaskAlertTransaction {
  private readonly store: FakeRefundTaskAlertStore;

  constructor(store: FakeRefundTaskAlertStore) {
    this.store = store;
  }

  async lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert(): Promise<
    PendingRefundOfCancelledSale[]
  > {
    this.store.operationOrder.push("lockRefunds");
    return this.store.refunds
      .filter((refund) => !refund.hasOpenRefundTaskAlert)
      .map(({ hasOpenRefundTaskAlert: _hasOpenRefundTaskAlert, ...refund }) => refund);
  }

  async openRefundTaskAlert(
    refund: PendingRefundOfCancelledSale,
    level: AlertLevel,
    openedAt: Date,
  ): Promise<void> {
    this.store.operationOrder.push("openRefundTaskAlert");
    if (this.store.failOn === "openRefundTaskAlert") {
      throw new Error("openRefundTaskAlert failed");
    }
    this.store.opened.push({
      refundId: refund.refundId,
      saleId: refund.saleId,
      locationId: refund.locationId,
      method: refund.method,
      amount: refund.amount,
      refundOpenedAt: refund.openedAt,
      level,
      openedAt,
    });
    for (const stored of this.store.refunds) {
      if (stored.refundId === refund.refundId) {
        stored.hasOpenRefundTaskAlert = true;
      }
    }
  }
}

export class FakeRefundTaskAlertStore implements RefundTaskAlertStore {
  refunds: FakeRefundOfSale[];
  opened: OpenedRefundTaskAlert[] = [];
  operationOrder: RefundTaskAlertStep[] = [];
  failOn: RefundTaskAlertStep | undefined;
  transactions = 0;

  constructor(refunds: FakeRefundOfSale[] = []) {
    this.refunds = refunds;
  }

  async transaction<TOutcome>(
    work: (tx: RefundTaskAlertTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const refundsBefore = structuredClone(this.refunds);
    const openedBefore = [...this.opened];
    try {
      return await work(new FakeRefundTaskAlertTransaction(this));
    } catch (error) {
      this.refunds = refundsBefore;
      this.opened = openedBefore;
      throw error;
    }
  }
}
