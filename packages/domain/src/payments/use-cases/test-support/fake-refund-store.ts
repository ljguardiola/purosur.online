import type { AlertKind } from "../../../alerts/index.js";
import type { Clock } from "../../../shared/index.js";
import type {
  LockedRefund,
  PendingRefundRecord,
  PendingRefundsReader,
  RefundStore,
  RefundStoreTransaction,
} from "../refund-store.js";

export interface FakeStoredRefund extends LockedRefund {
  locationId: string;
  doneBy?: string;
  doneAt?: Date;
  discardedBy?: string;
  discardedAt?: Date;
}

export interface ResolvedRefundAlert {
  refundId: string;
  kind: AlertKind;
  resolvedBy: string;
  resolvedAt: Date;
}

type RefundStoreWrite = "recordRefundDone" | "recordRefundDiscarded" | "resolveRefundAlert";

class FakeRefundStoreTransaction implements RefundStoreTransaction {
  private readonly refunds: FakeStoredRefund[];
  private readonly store: FakeRefundStore;

  constructor(refunds: FakeStoredRefund[], store: FakeRefundStore) {
    this.refunds = refunds;
    this.store = store;
  }

  async lockRefund(refundId: string, locationId: string): Promise<LockedRefund | undefined> {
    this.store.operationOrder.push("lockRefund");
    const refund = this.refunds.find(
      (stored) => stored.id === refundId && stored.locationId === locationId,
    );
    return refund && { id: refund.id, state: refund.state, origin: refund.origin };
  }

  async recordRefundDone(refundId: string, doneBy: string, doneAt: Date): Promise<void> {
    this.store.operationOrder.push("recordRefundDone");
    if (this.store.failOn === "recordRefundDone") {
      throw new Error("recordRefundDone failed");
    }
    for (const refund of this.refunds) {
      if (refund.id === refundId) {
        refund.state = "APPROVED";
        refund.doneBy = doneBy;
        refund.doneAt = doneAt;
      }
    }
  }

  async recordRefundDiscarded(
    refundId: string,
    discardedBy: string,
    discardedAt: Date,
  ): Promise<void> {
    this.store.operationOrder.push("recordRefundDiscarded");
    if (this.store.failOn === "recordRefundDiscarded") {
      throw new Error("recordRefundDiscarded failed");
    }
    for (const refund of this.refunds) {
      if (refund.id === refundId) {
        refund.state = "DISCARDED";
        refund.discardedBy = discardedBy;
        refund.discardedAt = discardedAt;
      }
    }
  }

  async resolveRefundAlert(
    refundId: string,
    kind: AlertKind,
    resolvedBy: string,
    resolvedAt: Date,
  ): Promise<void> {
    this.store.operationOrder.push("resolveRefundAlert");
    if (this.store.failOn === "resolveRefundAlert") {
      throw new Error("resolveRefundAlert failed");
    }
    this.store.resolvedAlerts.push({ refundId, kind, resolvedBy, resolvedAt });
  }
}

export interface FakePendingRefund extends PendingRefundRecord {
  locationId: string;
}

export class FakeRefundStore implements RefundStore, PendingRefundsReader {
  refunds: FakeStoredRefund[];
  pending: FakePendingRefund[];
  failOn: RefundStoreWrite | undefined;
  operationOrder: string[] = [];
  resolvedAlerts: ResolvedRefundAlert[] = [];
  transactions = 0;
  pendingReads: string[] = [];

  constructor(refunds: FakeStoredRefund[] = [], pending: FakePendingRefund[] = []) {
    this.refunds = refunds;
    this.pending = pending;
  }

  async pendingRefunds(locationId: string): Promise<PendingRefundRecord[]> {
    this.pendingReads.push(locationId);
    return this.pending
      .filter((refund) => refund.locationId === locationId)
      .map(({ locationId: _location, ...refund }) => structuredClone(refund));
  }

  async transaction<TOutcome>(
    work: (tx: RefundStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const before = structuredClone(this.refunds);
    const alertsBefore = [...this.resolvedAlerts];
    try {
      return await work(new FakeRefundStoreTransaction(this.refunds, this));
    } catch (error) {
      this.refunds = before;
      this.resolvedAlerts = alertsBefore;
      throw error;
    }
  }
}

export class FixedClock implements Clock {
  private readonly moment: Date;

  constructor(moment: Date) {
    this.moment = moment;
  }

  now(): Date {
    return new Date(this.moment);
  }
}
