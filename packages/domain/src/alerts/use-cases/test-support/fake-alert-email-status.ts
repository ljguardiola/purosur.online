import type {
  AlertEmailStatusQuery,
  AlertEmailStatusStore,
  QueriedAlertEmailStatus,
  SentAlertEmail,
} from "../alert-email-status-ports.js";

export class FakeAlertEmailStatusStore implements AlertEmailStatusStore {
  readonly undelivered: string[] = [];
  private readonly sentByProviderMessageId = new Map<string, SentAlertEmail>();

  seedSent(providerMessageId: string, deliveryId: string): void {
    this.sentByProviderMessageId.set(providerMessageId, { deliveryId });
  }

  async sentAlertEmailOfProviderMessage(
    providerMessageId: string,
  ): Promise<SentAlertEmail | undefined> {
    return this.sentByProviderMessageId.get(providerMessageId);
  }

  async recordEmailUndelivered(deliveryId: string): Promise<void> {
    this.undelivered.push(deliveryId);
  }
}

export class FakeAlertEmailStatusQuery implements AlertEmailStatusQuery {
  readonly queried: string[] = [];
  answer: QueriedAlertEmailStatus = { kind: "in_transit" };

  async queriedAlertEmailStatus(providerMessageId: string): Promise<QueriedAlertEmailStatus> {
    this.queried.push(providerMessageId);
    return this.answer;
  }
}
