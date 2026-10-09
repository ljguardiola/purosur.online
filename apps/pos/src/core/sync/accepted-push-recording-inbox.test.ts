import type { PushedEvent } from "@purosur/domain";
import type {
  AcceptedPushLog,
  CloudEventInbox,
  CloudEventInboxAnswer,
} from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import { AcceptedPushRecordingInbox } from "./accepted-push-recording-inbox";

class RecordingLog implements AcceptedPushLog {
  recorded: Date[] = [];

  async recordAcceptedPush(at: Date): Promise<void> {
    this.recorded.push(at);
  }
}

const NOW = new Date("2026-10-05T15:00:00.000Z");

function inboxAnswering(answer: CloudEventInboxAnswer<string>): CloudEventInbox<string> {
  return { push: async () => answer };
}

async function pushThrough(answer: CloudEventInboxAnswer<string>) {
  const log = new RecordingLog();
  const inbox = new AcceptedPushRecordingInbox({
    inbox: inboxAnswering(answer),
    log,
    clock: { now: () => NOW },
  });
  const events: PushedEvent[] = [];
  const returned = await inbox.push(events);
  return { log, returned };
}

describe("an inbox that records what the cloud accepted", () => {
  it("records the instant the cloud received the push and returns its answer", async () => {
    const { log, returned } = await pushThrough({ kind: "received", ackSeq: 4 });

    expect(returned).toEqual({ kind: "received", ackSeq: 4 });
    expect(log.recorded).toEqual([NOW]);
  });

  it.each<CloudEventInboxAnswer<string>>([
    { kind: "gap", ackSeq: 1, expectedSeq: 2 },
    { kind: "stale_device", ackSeq: 1 },
    { kind: "update_required", ackSeq: 1 },
    { kind: "revoked" },
    { kind: "failed", failure: "unreachable" },
  ])("records nothing for the answer %j and returns it", async (answer) => {
    const { log, returned } = await pushThrough(answer);

    expect(returned).toEqual(answer);
    expect(log.recorded).toEqual([]);
  });

  it("hands the wrapped inbox the events it was given", async () => {
    const pushed: (readonly PushedEvent[])[] = [];
    const inbox = new AcceptedPushRecordingInbox({
      inbox: {
        push: async (events) => {
          pushed.push(events);
          return { kind: "received", ackSeq: 1 };
        },
      },
      log: new RecordingLog(),
      clock: { now: () => NOW },
    });
    const events: PushedEvent[] = [];

    await inbox.push(events);

    expect(pushed).toEqual([events]);
  });
});
