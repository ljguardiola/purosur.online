import type { PushedEvent } from "@purosur/domain";
import {
  type AcceptedPushLog,
  type Clock,
  type CloudEventInboxAnswer,
  type CloudEventInbox as CloudEventInboxPort,
  recordAcceptedPush,
} from "@purosur/domain/sync/use-cases";

export interface AcceptedPushRecordingInboxDeps<TFailure> {
  inbox: CloudEventInboxPort<TFailure>;
  log: AcceptedPushLog;
  clock: Clock;
}

export class AcceptedPushRecordingInbox<TFailure> implements CloudEventInboxPort<TFailure> {
  private readonly deps: AcceptedPushRecordingInboxDeps<TFailure>;

  constructor(deps: AcceptedPushRecordingInboxDeps<TFailure>) {
    this.deps = deps;
  }

  async push(events: readonly PushedEvent[]): Promise<CloudEventInboxAnswer<TFailure>> {
    const answer = await this.deps.inbox.push(events);
    if (answer.kind === "received") {
      await recordAcceptedPush({ log: this.deps.log, clock: this.deps.clock });
    }
    return answer;
  }
}
