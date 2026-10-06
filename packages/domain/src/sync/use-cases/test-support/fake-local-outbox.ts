import type { PushedEvent } from "../../model/push-batch.js";
import type { CloudEventInbox, CloudEventInboxAnswer, LocalOutbox } from "../sync-ports.js";

export class FakeLocalOutbox implements LocalOutbox {
  held: PushedEvent[];
  acknowledgedThrough: number[] = [];
  resentFrom: number[] = [];
  readLimits: number[] = [];
  compromised = false;
  private readonly acknowledged = new Set<number>();

  constructor(events: PushedEvent[], alreadyAcknowledgedThrough = 0) {
    this.held = [...events];
    this.markAcknowledged((seq) => seq <= alreadyAcknowledgedThrough);
  }

  get events(): PushedEvent[] {
    return this.held.filter((event) => !this.acknowledged.has(event.device_seq));
  }

  async unacknowledged(limit: number): Promise<PushedEvent[]> {
    this.readLimits.push(limit);
    return this.events.slice(0, limit);
  }

  async acknowledgeThrough(deviceSeq: number): Promise<void> {
    this.acknowledgedThrough.push(deviceSeq);
    this.markAcknowledged((seq) => seq <= deviceSeq);
  }

  async resendFrom(deviceSeq: number): Promise<void> {
    this.resentFrom.push(deviceSeq);
    for (const event of this.held) {
      if (event.device_seq >= deviceSeq) {
        this.acknowledged.delete(event.device_seq);
      }
    }
  }

  async recordCompromised(): Promise<void> {
    this.compromised = true;
  }

  private markAcknowledged(matches: (deviceSeq: number) => boolean): void {
    for (const event of this.held) {
      if (matches(event.device_seq)) {
        this.acknowledged.add(event.device_seq);
      }
    }
  }
}

export type FakeCloudAnswer = CloudEventInboxAnswer<string>;

export class FakeCloudEventInbox implements CloudEventInbox<string> {
  pushedBatches: PushedEvent[][] = [];
  private readonly answers: FakeCloudAnswer[];

  constructor(answers: FakeCloudAnswer[]) {
    this.answers = [...answers];
  }

  async push(events: readonly PushedEvent[]): Promise<FakeCloudAnswer> {
    this.pushedBatches.push([...events]);
    const answer = this.answers.shift();
    if (answer === undefined) {
      throw new Error("test setup: no answer left for a push");
    }
    return answer;
  }
}
