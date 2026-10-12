import type { LatePaymentRefund } from "../../model/payment-refund.js";
import type { MercadoPagoOrderTransaction } from "../../model/payment-transaction.js";
import {
  type LatePaymentRefundOpening,
  PaymentTransactionAlreadyRecorded,
  type PaymentTransactionLane,
  type PaymentTransactionLanes,
  type PaymentTransactionOutcome,
  type PaymentTransactionReading,
  type RecordedOrderState,
} from "../mercado-pago-order-ports.js";

type LaneWrite =
  | "recordPendingTransaction"
  | "recordCreationAttempt"
  | "recordCreationCreatedNothing"
  | "recordNeedsReview"
  | "recordExpired"
  | "recordOrderCreated"
  | "recordNoOtherOrderPossible"
  | "recordOrderResult"
  | "openLatePaymentRefund";

export interface OpenedLatePaymentRefund {
  refund: LatePaymentRefund;
  openedAt: Date;
}

class FakeLane implements PaymentTransactionLane {
  private readonly lanes: FakePaymentTransactionLanes;

  constructor(lanes: FakePaymentTransactionLanes) {
    this.lanes = lanes;
  }

  async recordedTransaction(
    registerId: string,
    paymentTransactionId: string,
  ): Promise<MercadoPagoOrderTransaction | null> {
    this.lanes.operations.push("recordedTransaction");
    const stored = this.lanes.transactions.get(paymentTransactionId);
    return stored?.registerId === registerId ? structuredClone(stored) : null;
  }

  async recordPendingTransaction(transaction: MercadoPagoOrderTransaction): Promise<void> {
    this.lanes.operations.push("recordPendingTransaction");
    this.lanes.failIfAsked("recordPendingTransaction");
    if (this.lanes.racer) {
      this.lanes.seed(this.lanes.racer);
    }
    if (this.lanes.transactions.has(transaction.id)) {
      throw new PaymentTransactionAlreadyRecorded();
    }
    this.lanes.transactions.set(transaction.id, structuredClone(transaction));
  }

  async recordCreationAttempt(paymentTransactionId: string, expiresAt: Date): Promise<void> {
    this.lanes.operations.push("recordCreationAttempt");
    this.lanes.failIfAsked("recordCreationAttempt");
    const stored = this.lanes.transactions.get(paymentTransactionId);
    if (stored) {
      stored.expiresAt = new Date(expiresAt);
      stored.creationOutcomeUnknown = true;
    }
  }

  async recordCreationCreatedNothing(paymentTransactionId: string): Promise<void> {
    this.lanes.operations.push("recordCreationCreatedNothing");
    this.lanes.failIfAsked("recordCreationCreatedNothing");
    const stored = this.lanes.transactions.get(paymentTransactionId);
    if (stored) {
      stored.creationOutcomeUnknown = false;
    }
  }

  async recordNeedsReview(paymentTransactionId: string): Promise<void> {
    this.lanes.operations.push("recordNeedsReview");
    this.lanes.failIfAsked("recordNeedsReview");
    const stored = this.lanes.transactions.get(paymentTransactionId);
    if (stored) {
      stored.needsReview = true;
    }
  }

  async recordExpired(paymentTransactionId: string): Promise<void> {
    this.lanes.operations.push("recordExpired");
    this.lanes.failIfAsked("recordExpired");
    const stored = this.lanes.transactions.get(paymentTransactionId);
    if (stored) {
      stored.state = "EXPIRED";
    }
  }

  async recordOrderCreated(
    paymentTransactionId: string,
    providerOrderId: string,
    reading: PaymentTransactionReading | null,
  ): Promise<RecordedOrderState> {
    this.lanes.operations.push("recordOrderCreated");
    this.lanes.failIfAsked("recordOrderCreated");
    const stored = this.lanes.transactions.get(paymentTransactionId);
    if (stored) {
      stored.providerOrderId = providerOrderId;
    }
    if (reading === null) {
      return { state: stored?.state ?? "PENDING", replaced: stored?.replaced ?? false };
    }
    return this.store(paymentTransactionId, reading.outcome, reading.readAt);
  }

  async recordNoOtherOrderPossible(paymentTransactionId: string): Promise<void> {
    this.lanes.operations.push("recordNoOtherOrderPossible");
    this.lanes.failIfAsked("recordNoOtherOrderPossible");
    const stored = this.lanes.transactions.get(paymentTransactionId);
    if (stored) {
      stored.creationOutcomeUnknown = false;
    }
  }

  async recordOrderResult(
    paymentTransactionId: string,
    outcome: PaymentTransactionOutcome,
    readAt: Date,
  ): Promise<RecordedOrderState> {
    this.lanes.operations.push("recordOrderResult");
    this.lanes.failIfAsked("recordOrderResult");
    return this.store(paymentTransactionId, outcome, readAt);
  }

  async openLatePaymentRefund(
    refund: LatePaymentRefund,
    openedAt: Date,
  ): Promise<LatePaymentRefundOpening> {
    this.lanes.operations.push("openLatePaymentRefund");
    this.lanes.failIfAsked("openLatePaymentRefund");
    const key = `${refund.paymentId}|${refund.providerOrderId ?? ""}`;
    if (this.lanes.latePaymentRefunds.has(key)) {
      return "already_open";
    }
    this.lanes.latePaymentRefunds.set(key, {
      refund: structuredClone(refund),
      openedAt: new Date(openedAt),
    });
    return "opened";
  }

  async inOneTransaction<TOutcome>(
    work: (lane: PaymentTransactionLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = {
      transactions: structuredClone(this.lanes.transactions),
      resultReadAt: structuredClone(this.lanes.resultReadAt),
      latePaymentRefunds: structuredClone(this.lanes.latePaymentRefunds),
    };
    try {
      return await work(this);
    } catch (error) {
      this.lanes.restore(before);
      throw error;
    }
  }

  private store(
    paymentTransactionId: string,
    outcome: PaymentTransactionOutcome,
    readAt: Date,
  ): RecordedOrderState {
    if (this.lanes.replacementLandsBeforeNextWrite) {
      this.lanes.replacementLandsBeforeNextWrite = false;
      const racing = this.lanes.transactions.get(paymentTransactionId);
      if (racing) {
        racing.replaced = true;
      }
    }
    const stored = this.lanes.transactions.get(paymentTransactionId);
    if (stored) {
      stored.state = outcome.state;
      stored.needsReview = outcome.needsReview;
    }
    this.lanes.resultReadAt.set(paymentTransactionId, new Date(readAt));
    return { state: outcome.state, replaced: stored?.replaced ?? false };
  }
}

function replaceContents<TValue>(live: Map<string, TValue>, saved: Map<string, TValue>) {
  live.clear();
  for (const [key, value] of saved) {
    live.set(key, value);
  }
}

export class FakePaymentTransactionLanes implements PaymentTransactionLanes {
  readonly operations: string[] = [];
  readonly transactions = new Map<string, MercadoPagoOrderTransaction>();
  readonly resultReadAt = new Map<string, Date>();
  readonly latePaymentRefunds = new Map<string, OpenedLatePaymentRefund>();
  replacementLandsBeforeNextWrite = false;
  readonly lanesEntered: string[] = [];
  held = false;
  failOn: LaneWrite | undefined;
  racer: MercadoPagoOrderTransaction | undefined;

  seed(transaction: MercadoPagoOrderTransaction) {
    this.transactions.set(transaction.id, structuredClone(transaction));
  }

  restore(before: {
    transactions: Map<string, MercadoPagoOrderTransaction>;
    resultReadAt: Map<string, Date>;
    latePaymentRefunds: Map<string, OpenedLatePaymentRefund>;
  }) {
    replaceContents(this.transactions, before.transactions);
    replaceContents(this.resultReadAt, before.resultReadAt);
    replaceContents(this.latePaymentRefunds, before.latePaymentRefunds);
  }

  failIfAsked(write: LaneWrite) {
    if (this.failOn === write) {
      throw new Error(`${write} failed`);
    }
  }

  async inPaymentTransactionLane<TOutcome>(
    paymentTransactionId: string,
    work: (lane: PaymentTransactionLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push("enterLane");
    this.lanesEntered.push(paymentTransactionId);
    this.held = true;
    try {
      return await work(new FakeLane(this));
    } finally {
      this.held = false;
      this.operations.push("leaveLane");
    }
  }
}
