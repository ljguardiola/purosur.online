import type {
  AlertEmailStatusQuery,
  AlertEmailStatusStore,
  QueriedAlertEmailStatus,
  SentAlertEmail,
} from "../alert-email-status-ports.js";

export class FakeAlertEmailStatusStore implements AlertEmailStatusStore {
  readonly undelivered: string[] = [];
  readonly reads: string[] = [];
  private readonly sentByProviderMessageId = new Map<string, SentAlertEmail>();
  private readonly pendingDeliveryIds = new Set<string>();
  private sendRunning = false;

  seedSent(providerMessageId: string, deliveryId: string): void {
    this.sentByProviderMessageId.set(providerMessageId, { deliveryId });
  }

  seedPending(deliveryId: string): void {
    this.pendingDeliveryIds.add(deliveryId);
  }

  seedSendRunning(): void {
    this.sendRunning = true;
  }

  async sentAlertEmailOfProviderMessage(
    providerMessageId: string,
  ): Promise<SentAlertEmail | undefined> {
    this.reads.push("sentAlertEmailOfProviderMessage");
    return this.sentByProviderMessageId.get(providerMessageId);
  }

  async isAlertEmailSendRunning(): Promise<boolean> {
    this.reads.push("isAlertEmailSendRunning");
    return this.sendRunning;
  }

  async isAlertEmailDeliveryPending(deliveryId: string): Promise<boolean> {
    return this.pendingDeliveryIds.has(deliveryId);
  }

  async recordEmailUndelivered(deliveryId: string): Promise<void> {
    this.undelivered.push(deliveryId);
  }
}

export class FakeAlertEmailStatusQuery implements AlertEmailStatusQuery {
  readonly queried: string[] = [];
  answer: QueriedAlertEmailStatus = { kind: "answered", status: "sent", alertDeliveryId: null };

  async queriedAlertEmailStatus(providerMessageId: string): Promise<QueriedAlertEmailStatus> {
    this.queried.push(providerMessageId);
    return this.answer;
  }
}
