import type { ProviderPaymentTransaction } from "../../model/payment-transaction.js";
import {
  PaymentTransactionAlreadyRecorded,
  type PaymentTransactionLane,
  type PaymentTransactionLanes,
  type PaymentTransactionOutcome,
  type PaymentTransactionReading,
} from "../mercado-pago-qr-order-ports.js";

type LaneWrite =
  | "recordPendingTransaction"
  | "recordCreationAttempt"
  | "recordCreationCreatedNothing"
  | "recordNeedsReview"
  | "recordExpired"
  | "recordOrderCreated"
  | "recordOrderResult";

class FakeLane implements PaymentTransactionLane {
  private readonly lanes: FakePaymentTransactionLanes;

  constructor(lanes: FakePaymentTransactionLanes) {
    this.lanes = lanes;
  }

  async recordedTransaction(
    registerId: string,
    paymentTransactionId: string,
  ): Promise<ProviderPaymentTransaction | null> {
    this.lanes.operations.push("recordedTransaction");
    const stored = this.lanes.transactions.get(paymentTransactionId);
    return stored?.registerId === registerId ? structuredClone(stored) : null;
  }

  async recordPendingTransaction(transaction: ProviderPaymentTransaction): Promise<void> {
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
  ): Promise<void> {
    this.lanes.operations.push("recordOrderCreated");
    this.lanes.failIfAsked("recordOrderCreated");
    const stored = this.lanes.transactions.get(paymentTransactionId);
    if (stored) {
      stored.providerOrderId = providerOrderId;
    }
    if (reading !== null) {
      this.store(paymentTransactionId, reading.outcome, reading.readAt);
    }
  }

  async recordOrderResult(
    paymentTransactionId: string,
    outcome: PaymentTransactionOutcome,
    readAt: Date,
  ): Promise<void> {
    this.lanes.operations.push("recordOrderResult");
    this.lanes.failIfAsked("recordOrderResult");
    this.store(paymentTransactionId, outcome, readAt);
  }

  private store(paymentTransactionId: string, outcome: PaymentTransactionOutcome, readAt: Date) {
    const stored = this.lanes.transactions.get(paymentTransactionId);
    if (stored) {
      stored.state = outcome.state;
      stored.needsReview = outcome.needsReview;
    }
    this.lanes.resultReadAt.set(paymentTransactionId, new Date(readAt));
  }
}

export class FakePaymentTransactionLanes implements PaymentTransactionLanes {
  readonly operations: string[] = [];
  readonly transactions = new Map<string, ProviderPaymentTransaction>();
  readonly resultReadAt = new Map<string, Date>();
  readonly lanesEntered: string[] = [];
  held = false;
  failOn: LaneWrite | undefined;
  racer: ProviderPaymentTransaction | undefined;

  seed(transaction: ProviderPaymentTransaction) {
    this.transactions.set(transaction.id, structuredClone(transaction));
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
