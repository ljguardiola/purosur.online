import type {
  EntityChangeFeed,
  PendingRedelivery,
  PulledChange,
  PulledEntity,
  PullPage,
  RedeliveryReplica,
} from "../sync-ports.js";
import type { FakeFeedAnswer } from "./fake-local-replica.js";

export class FakeRedeliveryReplica implements RedeliveryReplica<PulledChange> {
  pending: PendingRedelivery[];
  savedPages: { entity: PulledEntity; page: PullPage<PulledChange> }[] = [];
  finished: PulledEntity[] = [];

  constructor(pending: PendingRedelivery[] = []) {
    this.pending = pending.map((redelivery) => ({ ...redelivery }));
  }

  async pendingRedeliveries(): Promise<PendingRedelivery[]> {
    return this.pending.map((redelivery) => ({ ...redelivery }));
  }

  async saveRedeliveredPage(entity: PulledEntity, page: PullPage<PulledChange>): Promise<void> {
    this.savedPages.push({ entity, page });
    for (const redelivery of this.pending) {
      if (redelivery.entity === entity) {
        redelivery.cursor = page.cursor;
      }
    }
  }

  async finishRedelivery(entity: PulledEntity): Promise<void> {
    this.finished.push(entity);
    this.pending = this.pending.filter((redelivery) => redelivery.entity !== entity);
  }
}

export class FakeEntityChangeFeed implements EntityChangeFeed<PulledChange, string> {
  asked: { entity: PulledEntity; since: number }[] = [];
  private readonly answers: FakeFeedAnswer[];

  constructor(answers: FakeFeedAnswer[]) {
    this.answers = [...answers];
  }

  async pageOfEntityAfter(entity: PulledEntity, since: number): Promise<FakeFeedAnswer> {
    this.asked.push({ entity, since });
    const answer = this.answers.shift();
    if (answer === undefined) {
      throw new Error(`test setup: no answer left for ${entity} from ${since}`);
    }
    return answer;
  }
}
