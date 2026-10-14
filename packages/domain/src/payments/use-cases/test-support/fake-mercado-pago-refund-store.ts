import type { AlertKind } from "../../../alerts/index.js";
import type {
  MercadoPagoRefundRecord,
  MercadoPagoRefundReference,
  MercadoPagoRefundStore,
  MercadoPagoRefundTransaction,
  OriginCancellation,
} from "../mercado-pago-refund-ports.js";
import type { LockedRefund } from "../refund-store.js";
import type { ResolvedRefundAlert } from "./fake-refund-store.js";

export interface FakeMercadoPagoStoredRefund extends MercadoPagoRefundRecord {
  doneBy?: string;
  doneAt?: Date;
}

export type MercadoPagoRefundWrite =
  | "recordRefundConfirmed"
  | "recordAttemptKey"
  | "recordRefundSent"
  | "recordRefundRefusal"
  | "recordRefundDone"
  | "resolveRefundAlert";

class FakeMercadoPagoRefundTransaction implements MercadoPagoRefundTransaction {
  private readonly store: FakeMercadoPagoRefundStore;

  constructor(store: FakeMercadoPagoRefundStore) {
    this.store = store;
  }

  private begin(operation: MercadoPagoRefundWrite) {
    this.store.log.push(operation);
    if (this.store.failOn === operation) {
      throw new Error(`${operation} failed`);
    }
  }

  private refund(refundId: string): FakeMercadoPagoStoredRefund {
    const refund = this.store.refunds.find((stored) => stored.id === refundId);
    if (!refund) {
      throw new Error(`refund ${refundId} is not stored`);
    }
    return refund;
  }

  async lockRefund(refundId: string, locationId: string): Promise<LockedRefund | undefined> {
    this.store.log.push("lockRefund");
    const refund = this.store.refunds.find(
      (stored) => stored.id === refundId && stored.locationId === locationId,
    );
    return (
      refund && { id: refund.id, state: refund.state, origin: refund.origin, method: refund.method }
    );
  }

  async lockMercadoPagoRefund(
    refundId: string,
    locationId: string,
  ): Promise<MercadoPagoRefundRecord | undefined> {
    this.store.log.push("lockMercadoPagoRefund");
    const refund = this.store.refunds.find(
      (stored) => stored.id === refundId && stored.locationId === locationId,
    );
    return refund && structuredClone(refund);
  }

  async cancellationOfEvent(originEventId: string): Promise<OriginCancellation | null> {
    this.store.log.push("cancellationOfEvent");
    const saleId = this.store.cancellations.get(originEventId);
    return saleId === undefined ? null : { saleId };
  }

  async recordRefundConfirmed(
    refundId: string,
    confirmedBy: string,
    confirmedAt: Date,
    attemptKey: string,
  ): Promise<void> {
    this.begin("recordRefundConfirmed");
    Object.assign(this.refund(refundId), { confirmedBy, confirmedAt, attemptKey });
  }

  async recordAttemptKey(refundId: string, attemptKey: string | null): Promise<void> {
    this.begin("recordAttemptKey");
    this.refund(refundId).attemptKey = attemptKey;
  }

  async recordRefundSent(refundId: string, providerRefundId: string, sentAt: Date): Promise<void> {
    this.begin("recordRefundSent");
    Object.assign(this.refund(refundId), {
      providerRefundId,
      sentAt,
      lastRefusalReason: null,
    });
  }

  async recordRefundRefusal(refundId: string, reason: string, _refusedAt: Date): Promise<void> {
    this.begin("recordRefundRefusal");
    this.refund(refundId).lastRefusalReason = reason;
  }

  async recordRefundDone(refundId: string, doneBy: string, doneAt: Date): Promise<void> {
    this.begin("recordRefundDone");
    Object.assign(this.refund(refundId), { state: "APPROVED", doneBy, doneAt });
  }

  async recordRefundDiscarded(): Promise<void> {
    throw new Error("a refund sent by the cloud is never discarded");
  }

  async resolveRefundAlert(
    refundId: string,
    kind: AlertKind,
    resolvedBy: string,
    resolvedAt: Date,
  ): Promise<void> {
    this.begin("resolveRefundAlert");
    this.store.resolvedAlerts.push({ refundId, kind, resolvedBy, resolvedAt });
  }
}

export class FakeMercadoPagoRefundStore implements MercadoPagoRefundStore {
  refunds: FakeMercadoPagoStoredRefund[];
  readonly cancellations = new Map<string, string>();
  readonly log: string[];
  resolvedAlerts: ResolvedRefundAlert[] = [];
  failOn: MercadoPagoRefundWrite | undefined;

  constructor(refunds: FakeMercadoPagoStoredRefund[], log: string[] = []) {
    this.refunds = refunds;
    this.log = log;
  }

  async refundReference(
    refundId: string,
    locationId: string,
  ): Promise<MercadoPagoRefundReference | undefined> {
    const refund = this.refunds.find(
      (stored) => stored.id === refundId && stored.locationId === locationId,
    );
    return refund && referenceOf(refund);
  }

  async confirmedPendingRefunds(): Promise<MercadoPagoRefundReference[]> {
    return this.refunds
      .filter((refund) => refund.state === "PENDING" && refund.confirmedAt !== null)
      .map(referenceOf);
  }

  async transaction<TOutcome>(
    work: (tx: MercadoPagoRefundTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.refunds);
    const alertsBefore = [...this.resolvedAlerts];
    try {
      return await work(new FakeMercadoPagoRefundTransaction(this));
    } catch (error) {
      this.refunds = before;
      this.resolvedAlerts = alertsBefore;
      throw error;
    }
  }
}

function referenceOf(refund: FakeMercadoPagoStoredRefund): MercadoPagoRefundReference {
  return {
    refundId: refund.id,
    locationId: refund.locationId,
    method: refund.method,
    origin: refund.origin,
    paymentTransactionId: refund.paymentTransactionId,
    confirmedAt: refund.confirmedAt,
    lastRefusalReason: refund.lastRefusalReason,
  };
}
