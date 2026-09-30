import type { CloudChangeFeed, LocalReplica, PulledChange, PullPage } from "../sync-ports.js";

export class FakeLocalReplica implements LocalReplica<PulledChange> {
  cursor: number;
  appliedChanges: PulledChange[] = [];
  savedPages: PullPage<PulledChange>[] = [];

  constructor(cursor = 0) {
    this.cursor = cursor;
  }

  async savedCursor(): Promise<number> {
    return this.cursor;
  }

  async savePage(page: PullPage<PulledChange>): Promise<void> {
    this.savedPages.push(page);
    this.appliedChanges.push(...page.changes);
    this.cursor = page.cursor;
  }
}

export type FakeFeedAnswer =
  | { kind: "page"; page: PullPage<PulledChange> }
  | { kind: "failed"; failure: string };

export class FakeCloudChangeFeed implements CloudChangeFeed<PulledChange, string> {
  askedFrom: number[] = [];
  private readonly answers: FakeFeedAnswer[];

  constructor(answers: FakeFeedAnswer[]) {
    this.answers = [...answers];
  }

  async pageAfter(since: number): Promise<FakeFeedAnswer> {
    this.askedFrom.push(since);
    const answer = this.answers.shift();
    if (answer === undefined) {
      throw new Error(`test setup: no answer left for a pull from ${since}`);
    }
    return answer;
  }
}
