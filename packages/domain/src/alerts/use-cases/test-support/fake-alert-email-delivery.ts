import type {
  AlertEmail,
  AlertEmailAttempt,
  AlertEmailDeliveryStore,
  AlertEmailFailure,
  AlertEmailLanes,
  AlertEmailSender,
  AlertEmailSendResult,
  AlertEmailSent,
  DueAlertEmailDelivery,
} from "../alert-email-delivery-ports.js";

export interface FakeEmailDelivery extends DueAlertEmailDelivery {
  status: "pending" | "sent" | "failed";
  nextAttemptAt: Date | null;
  error: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
}

export class FakeAlertEmailDeliveryStore implements AlertEmailDeliveryStore {
  readonly deliveries: FakeEmailDelivery[] = [];
  readonly log: string[];
  readonly attempts: ({ deliveryId: string } & AlertEmailAttempt)[] = [];
  private readonly lanes: FakeAlertEmailLanes;

  constructor(lanes: FakeAlertEmailLanes) {
    this.lanes = lanes;
    this.log = lanes.log;
  }

  seed(delivery: Partial<FakeEmailDelivery> & { deliveryId: string }): void {
    this.deliveries.push({
      to: `${delivery.deliveryId}@example.test`,
      alertId: "alert-1",
      kind: "backoffice_passkey_changed",
      stage: "opened",
      level: "warning",
      occurredAt: new Date("2026-10-01T11:00:00.000Z"),
      alertBranchName: null,
      recipientBranchName: "Casa Central",
      attemptsMade: 0,
      status: "pending",
      nextAttemptAt: null,
      error: null,
      providerMessageId: null,
      sentAt: null,
      ...structuredClone(delivery),
    });
  }

  find(deliveryId: string): FakeEmailDelivery {
    const found = this.deliveries.find((delivery) => delivery.deliveryId === deliveryId);
    if (!found) {
      throw new Error(`no delivery ${deliveryId}`);
    }
    return found;
  }

  async dueEmailDeliveries(now: Date): Promise<DueAlertEmailDelivery[]> {
    this.log.push(`dueEmailDeliveries:held=${this.lanes.held}`);
    return this.deliveries
      .filter(
        (delivery) =>
          delivery.status === "pending" &&
          (delivery.nextAttemptAt === null || delivery.nextAttemptAt <= now),
      )
      .map(
        ({
          status: _status,
          nextAttemptAt: _next,
          error: _e,
          providerMessageId: _p,
          sentAt: _s,
          ...due
        }) => structuredClone(due),
      );
  }

  async recordEmailAttempt(deliveryId: string, attempt: AlertEmailAttempt): Promise<void> {
    this.log.push(`recordEmailAttempt:${deliveryId}`);
    this.attempts.push({ deliveryId, ...structuredClone(attempt) });
    const delivery = this.find(deliveryId);
    delivery.attemptsMade = attempt.attempt;
    delivery.nextAttemptAt = new Date(attempt.nextAttemptAt);
  }

  async recordEmailSent(deliveryId: string, sent: AlertEmailSent): Promise<void> {
    this.log.push(`recordEmailSent:${deliveryId}`);
    const delivery = this.find(deliveryId);
    delivery.status = "sent";
    delivery.sentAt = new Date(sent.sentAt);
    delivery.providerMessageId = sent.providerMessageId;
    delivery.nextAttemptAt = null;
  }

  async recordEmailFailure(deliveryId: string, failure: AlertEmailFailure): Promise<void> {
    this.log.push(`recordEmailFailure:${deliveryId}`);
    const delivery = this.find(deliveryId);
    delivery.error = failure.error;
    if (failure.final) {
      delivery.status = "failed";
      delivery.nextAttemptAt = null;
    }
  }
}

export class FakeAlertEmailLanes implements AlertEmailLanes {
  readonly log: string[] = [];
  readonly store = new FakeAlertEmailDeliveryStore(this);
  held = false;

  async inAlertEmailLane<TOutcome>(
    work: (store: AlertEmailDeliveryStore) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.held = true;
    try {
      return await work(this.store);
    } finally {
      this.held = false;
    }
  }
}

export class FakeAlertEmailSender implements AlertEmailSender {
  readonly sent: AlertEmail[] = [];
  readonly results = new Map<string, AlertEmailSendResult | Error>();
  private readonly lanes: FakeAlertEmailLanes;

  constructor(lanes: FakeAlertEmailLanes) {
    this.lanes = lanes;
  }

  async sendAlertEmail(email: AlertEmail): Promise<AlertEmailSendResult> {
    this.lanes.log.push(`send:${email.deliveryId}:held=${this.lanes.held}`);
    this.sent.push(structuredClone(email));
    const result = this.results.get(email.deliveryId);
    if (result instanceof Error) {
      throw result;
    }
    return result ?? { kind: "sent", providerMessageId: `provider-${email.deliveryId}` };
  }
}
