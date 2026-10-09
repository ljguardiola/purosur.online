import type { AcceptedPushLog } from "../record-accepted-push.js";

export class FakeAcceptedPushLog implements AcceptedPushLog {
  recorded: Date[] = [];
  failWith: Error | undefined;

  async recordAcceptedPush(at: Date): Promise<void> {
    if (this.failWith !== undefined) {
      throw this.failWith;
    }
    this.recorded.push(at);
  }
}
