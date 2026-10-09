import { PUSH_BATCH_MAX_EVENTS } from "../model/push-batch.js";
import type { PushOutboxPorts } from "./sync-ports.js";

export type PushOutboxOutcome<TFailure> =
  | { kind: "up_to_date" }
  | { kind: "pushed"; ackSeq: number }
  | { kind: "ack_short_of_batch"; ackSeq: number }
  | { kind: "gap"; expectedSeq: number }
  | { kind: "stale_device" }
  | { kind: "update_required" }
  | { kind: "revoked" }
  | { kind: "compromised" }
  | { kind: "failed"; failure: TFailure };

export async function pushOutbox<TFailure>({
  outbox,
  inbox,
  installation,
}: PushOutboxPorts<TFailure>): Promise<PushOutboxOutcome<TFailure>> {
  let pushedAny = false;
  let lastAckSeq = 0;
  for (;;) {
    const events = await outbox.unacknowledged(PUSH_BATCH_MAX_EVENTS);
    const firstSentSeq = events[0]?.device_seq;
    const lastSentSeq = events.at(-1)?.device_seq;
    if (firstSentSeq === undefined || lastSentSeq === undefined) {
      return pushedAny
        ? { kind: "pushed", ackSeq: lastAckSeq }
        : reportWithoutEvents<TFailure>({ inbox, outbox, installation });
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
      case "gap": {
        await outbox.acknowledgeThrough(answer.ackSeq);
        if (
          !(await outbox.holdsEvent(answer.expectedSeq)) &&
          (await outbox.holdsEventAfter(answer.expectedSeq))
        ) {
          await outbox.recordCompromised();
          return { kind: "compromised" };
        }
        await outbox.resendFrom(answer.expectedSeq);
        const [nextToSend] = await outbox.unacknowledged(1);
        if (nextToSend !== undefined && nextToSend.device_seq < firstSentSeq) {
          break;
        }
        return { kind: "gap", expectedSeq: answer.expectedSeq };
      }
      case "stale_device":
        return { kind: "stale_device" };
      case "update_required":
        await outbox.acknowledgeThrough(answer.ackSeq);
        return { kind: "update_required" };
      case "revoked":
        await installation.recordRevoked();
        return { kind: "revoked" };
      case "failed":
        return { kind: "failed", failure: answer.failure };
    }
  }
}

async function reportWithoutEvents<TFailure>({
  inbox,
  outbox,
  installation,
}: PushOutboxPorts<TFailure>): Promise<PushOutboxOutcome<TFailure>> {
  const answer = await inbox.push([]);
  switch (answer.kind) {
    case "received":
      return { kind: "up_to_date" };
    case "gap":
      return { kind: "gap", expectedSeq: answer.expectedSeq };
    case "stale_device":
      return { kind: "stale_device" };
    case "update_required":
      await outbox.acknowledgeThrough(answer.ackSeq);
      return { kind: "update_required" };
    case "revoked":
      await installation.recordRevoked();
      return { kind: "revoked" };
    case "failed":
      return { kind: "failed", failure: answer.failure };
  }
}
