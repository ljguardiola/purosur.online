import type {
  AlertEmail,
  AlertEmailAttempt,
  AlertEmailBranchReader,
  AlertEmailDeliveryStore,
  AlertEmailFailure,
  AlertEmailLaneRun,
  AlertEmailLanes,
  AlertEmailRecipient,
  AlertEmailRecipientReader,
  AlertEmailSender,
  AlertEmailSendResult,
  AlertEmailSent,
  PendingAlertEmailDelivery,
} from "../alert-email-delivery-ports.js";

interface FakeEmailDelivery extends PendingAlertEmailDelivery {
  status: "pending" | "sent" | "failed" | "skipped";
  error: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
}

class FakeAlertEmailDeliveryStore implements AlertEmailDeliveryStore {
  readonly deliveries: FakeEmailDelivery[] = [];
  readonly log: string[];
  readonly attempts: ({ deliveryId: string } & AlertEmailAttempt)[] = [];
  private readonly lanes: FakeAlertEmailLanes;

  constructor(lanes: FakeAlertEmailLanes) {
    this.lanes = lanes;
    this.log = lanes.log;
  }

  seed(delivery: Partial<FakeEmailDelivery> & { deliveryId: string }): void {
    const seeded: FakeEmailDelivery = {
      recipientUserId: `user-of-${delivery.deliveryId}`,
      alertId: "alert-1",
      kind: "backoffice_passkey_changed",
      stage: "opened",
      level: "warning",
      occurredAt: new Date("2026-10-01T11:00:00.000Z"),
      alertLocationId: null,
      attemptsMade: 0,
      status: "pending",
      nextAttemptAt: null,
      error: null,
      providerMessageId: null,
      sentAt: null,
      ...structuredClone(delivery),
    };
    this.deliveries.push(seeded);
    if (!this.lanes.recipients.recipients.has(seeded.recipientUserId)) {
      this.lanes.recipients.recipients.set(seeded.recipientUserId, {
        email: `${delivery.deliveryId}@example.test`,
        active: true,
        alertEmailOptedIn: true,
      });
    }
  }

  find(deliveryId: string): FakeEmailDelivery {
    const found = this.deliveries.find((delivery) => delivery.deliveryId === deliveryId);
    if (!found) {
      throw new Error(`no delivery ${deliveryId}`);
    }
    return found;
  }

  async pendingEmailDeliveries(): Promise<PendingAlertEmailDelivery[]> {
    this.log.push(`pendingEmailDeliveries:held=${this.lanes.held}`);
    return this.deliveries
      .filter((delivery) => delivery.status === "pending")
      .map(({ status: _status, error: _e, providerMessageId: _p, sentAt: _s, ...pending }) =>
        structuredClone(pending),
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

  async recordEmailSkipped(deliveryId: string): Promise<void> {
    this.log.push(`recordEmailSkipped:${deliveryId}`);
    const delivery = this.find(deliveryId);
    delivery.status = "skipped";
    delivery.nextAttemptAt = null;
  }

  async recordEmailFailure(deliveryId: string, failure: AlertEmailFailure): Promise<void> {
    this.log.push(`recordEmailFailure:${deliveryId}`);
    const delivery = this.find(deliveryId);
    delivery.error = failure.reason;
    if (failure.final) {
      delivery.status = "failed";
      delivery.nextAttemptAt = null;
    }
  }

  async recordEmailGivenUp(deliveryId: string): Promise<void> {
    this.log.push(`recordEmailGivenUp:${deliveryId}`);
    const delivery = this.find(deliveryId);
    delivery.status = "failed";
    delivery.nextAttemptAt = null;
  }
}

class FakeAlertEmailRecipients implements AlertEmailRecipientReader {
  readonly recipients = new Map<string, AlertEmailRecipient>();
  private readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  async alertEmailRecipient(userId: string): Promise<AlertEmailRecipient | undefined> {
    this.log.push(`alertEmailRecipient:${userId}`);
    const recipient = this.recipients.get(userId);
    return recipient === undefined ? undefined : structuredClone(recipient);
  }
}

class FakeAlertEmailBranches implements AlertEmailBranchReader {
  readonly addresses = new Map<string, string>();
  private readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  async alertEmailBranchAddress(locationId: string): Promise<string | null> {
    this.log.push(`alertEmailBranchAddress:${locationId}`);
    return this.addresses.get(locationId) ?? null;
  }
}

export class FakeAlertEmailLanes implements AlertEmailLanes {
  readonly log: string[] = [];
  readonly recipients = new FakeAlertEmailRecipients(this.log);
  readonly branches = new FakeAlertEmailBranches(this.log);
  readonly store = new FakeAlertEmailDeliveryStore(this);
  held = false;
  heldByAnotherRun = false;

  async inAlertEmailLane<TOutcome>(
    work: (store: AlertEmailDeliveryStore) => Promise<TOutcome>,
  ): Promise<AlertEmailLaneRun<TOutcome>> {
    if (this.heldByAnotherRun) {
      this.log.push("inAlertEmailLane:busy");
      return { kind: "busy" };
    }
    this.held = true;
    try {
      return { kind: "ran", result: await work(this.store) };
    } finally {
      this.held = false;
    }
  }
}

export class FakeAlertEmailSender implements AlertEmailSender {
  readonly sent: AlertEmail[] = [];
  readonly results = new Map<string, AlertEmailSendResult | Error>();
  onSend: (email: AlertEmail) => void = () => {};
  private readonly lanes: FakeAlertEmailLanes;

  constructor(lanes: FakeAlertEmailLanes) {
    this.lanes = lanes;
  }

  async sendAlertEmail(email: AlertEmail): Promise<AlertEmailSendResult> {
    this.lanes.log.push(`send:${email.deliveryId}:held=${this.lanes.held}`);
    this.sent.push(structuredClone(email));
    this.onSend(email);
    const result = this.results.get(email.deliveryId);
    if (result instanceof Error) {
      throw result;
    }
    return result ?? { kind: "sent", providerMessageId: `provider-${email.deliveryId}` };
  }
}
