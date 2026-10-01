import type { PushedEvent } from "../../model/push-batch.js";
import type { CloudEventInbox, CloudEventInboxAnswer, LocalOutbox } from "../sync-ports.js";

export class FakeLocalOutbox implements LocalOutbox {
  events: PushedEvent[];
  acknowledgedThrough: number[] = [];
  readLimits: number[] = [];

  constructor(events: PushedEvent[]) {
    this.events = [...events];
  }

  async unacknowledged(limit: number): Promise<PushedEvent[]> {
    this.readLimits.push(limit);
    return this.events.slice(0, limit);
  }

  async acknowledgeThrough(deviceSeq: number): Promise<void> {
    this.acknowledgedThrough.push(deviceSeq);
    this.events = this.events.filter((event) => event.device_seq > deviceSeq);
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
