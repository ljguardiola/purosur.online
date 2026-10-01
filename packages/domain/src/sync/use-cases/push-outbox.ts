import { PUSH_BATCH_MAX_EVENTS } from "../model/push-batch.js";
import type { PushOutboxPorts } from "./sync-ports.js";

export type PushOutboxOutcome<TFailure> =
  | { kind: "up_to_date" }
  | { kind: "pushed"; ackSeq: number }
  | { kind: "ack_short_of_batch"; ackSeq: number }
  | { kind: "gap"; expectedSeq: number }
  | { kind: "stale_device" }
  | { kind: "revoked" }
  | { kind: "failed"; failure: TFailure };

export async function pushOutbox<TFailure>({
  outbox,
  inbox,
}: PushOutboxPorts<TFailure>): Promise<PushOutboxOutcome<TFailure>> {
  let pushedAny = false;
  let lastAckSeq = 0;
  for (;;) {
    const events = await outbox.unacknowledged(PUSH_BATCH_MAX_EVENTS);
    const lastSentSeq = events.at(-1)?.device_seq;
    if (lastSentSeq === undefined) {
      return pushedAny ? { kind: "pushed", ackSeq: lastAckSeq } : { kind: "up_to_date" };
    }
    const answer = await inbox.push(events);
    switch (answer.kind) {
      case "received":
        await outbox.acknowledgeThrough(answer.ackSeq);
        if (answer.ackSeq < lastSentSeq) {
          return { kind: "ack_short_of_batch", ackSeq: answer.ackSeq };
        }
        pushedAny = true;
        lastAckSeq = answer.ackSeq;
        break;
      case "gap":
        await outbox.acknowledgeThrough(answer.ackSeq);
        return { kind: "gap", expectedSeq: answer.expectedSeq };
      case "stale_device":
        return { kind: "stale_device" };
      case "revoked":
        return { kind: "revoked" };
      case "failed":
        return { kind: "failed", failure: answer.failure };
    }
  }
}
