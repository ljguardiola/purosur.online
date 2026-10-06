import { describe, expect, it } from "vitest";
import { pushOutbox } from "./push-outbox.js";
import { fakeEvent } from "./test-support/fake-inbox.js";
import {
  type FakeCloudAnswer,
  FakeCloudEventInbox,
  FakeLocalOutbox,
} from "./test-support/fake-local-outbox.js";

function eventsFrom(firstSeq: number, count: number) {
  return Array.from({ length: count }, (_, index) => fakeEvent(firstSeq + index));
}

function push(outbox: FakeLocalOutbox, answers: FakeCloudAnswer[]) {
  const inbox = new FakeCloudEventInbox(answers);
  return { inbox, outcome: pushOutbox({ outbox, inbox }) };
}

describe("pushing the outbox to the cloud", () => {
  it("has nothing to push when every event was acknowledged", async () => {
    const outbox = new FakeLocalOutbox([]);
    const { inbox, outcome } = push(outbox, []);

    expect(await outcome).toEqual({ kind: "up_to_date" });
    expect(inbox.pushedBatches).toEqual([]);
  });

  it("pushes the unacknowledged events in device_seq order and marks them acknowledged", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(5, 3));
    const { inbox, outcome } = push(outbox, [{ kind: "received", ackSeq: 7 }]);

    expect(await outcome).toEqual({ kind: "pushed", ackSeq: 7 });
    expect(inbox.pushedBatches.map((batch) => batch.map((event) => event.device_seq))).toEqual([
      [5, 6, 7],
    ]);
    expect(outbox.acknowledgedThrough).toEqual([7]);
  });

  it("reads batches of at most 200 events", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(1, 3));
    const { outcome } = push(outbox, [{ kind: "received", ackSeq: 3 }]);
    await outcome;

    expect(outbox.readLimits).toEqual([200, 200]);
  });

  it("drains a long outbox in batches of 200", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(1, 450));
    const { inbox, outcome } = push(outbox, [
      { kind: "received", ackSeq: 200 },
      { kind: "received", ackSeq: 400 },
      { kind: "received", ackSeq: 450 },
    ]);

    expect(await outcome).toEqual({ kind: "pushed", ackSeq: 450 });
    expect(inbox.pushedBatches.map((batch) => batch.length)).toEqual([200, 200, 50]);
    expect(outbox.acknowledgedThrough).toEqual([200, 400, 450]);
  });

  it("stops when the ack falls short of the batch, keeping what was acknowledged", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(1, 5));
    const { inbox, outcome } = push(outbox, [{ kind: "received", ackSeq: 3 }]);

    expect(await outcome).toEqual({ kind: "ack_short_of_batch", ackSeq: 3 });
    expect(inbox.pushedBatches).toHaveLength(1);
    expect(outbox.acknowledgedThrough).toEqual([3]);
  });

  it("acknowledges what the cloud holds and reports the gap with the device_seq it expects", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(1, 2));
    const { outcome } = push(outbox, [{ kind: "gap", ackSeq: 2, expectedSeq: 3 }]);

    expect(await outcome).toEqual({ kind: "gap", expectedSeq: 3 });
    expect(outbox.acknowledgedThrough).toEqual([2]);
  });

  it("sends again from the device_seq the cloud expects when the register had marked it acknowledged", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(1, 4), 3);
    const { inbox, outcome } = push(outbox, [
      { kind: "gap", ackSeq: 1, expectedSeq: 2 },
      { kind: "received", ackSeq: 4 },
    ]);

    expect(await outcome).toEqual({ kind: "pushed", ackSeq: 4 });
    expect(inbox.pushedBatches.map((batch) => batch.map((event) => event.device_seq))).toEqual([
      [4],
      [2, 3, 4],
    ]);
    expect(outbox.resentFrom).toEqual([2]);
  });

  it("records itself as compromised when it no longer holds the expected event but holds later ones", async () => {
    const outbox = new FakeLocalOutbox([fakeEvent(4), fakeEvent(5)]);
    const { inbox, outcome } = push(outbox, [{ kind: "gap", ackSeq: 2, expectedSeq: 3 }]);

    expect(await outcome).toEqual({ kind: "compromised" });
    expect(outbox.compromised).toBe(true);
    expect(inbox.pushedBatches).toHaveLength(1);
  });

  it("does not record itself as compromised when it holds the expected event", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(1, 4), 3);
    const { outcome } = push(outbox, [
      { kind: "gap", ackSeq: 1, expectedSeq: 2 },
      { kind: "received", ackSeq: 4 },
    ]);

    await outcome;
    expect(outbox.compromised).toBe(false);
  });

  it("reports the gap without recording itself as compromised when it holds nothing from the expected event on", async () => {
    const outbox = new FakeLocalOutbox([fakeEvent(1), fakeEvent(2)]);
    const { outcome } = push(outbox, [{ kind: "gap", ackSeq: 0, expectedSeq: 3 }]);

    expect(await outcome).toEqual({ kind: "gap", expectedSeq: 3 });
    expect(outbox.compromised).toBe(false);
  });

  it("reports the gap without pushing again when the batch it sent already started at the expected event", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(3, 2));
    const { inbox, outcome } = push(outbox, [{ kind: "gap", ackSeq: 2, expectedSeq: 3 }]);

    expect(await outcome).toEqual({ kind: "gap", expectedSeq: 3 });
    expect(inbox.pushedBatches).toHaveLength(1);
  });

  it("acknowledges nothing when the cloud says this is a stale device", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(1, 2));
    const { outcome } = push(outbox, [{ kind: "stale_device", ackSeq: 9 }]);

    expect(await outcome).toEqual({ kind: "stale_device" });
    expect(outbox.acknowledgedThrough).toEqual([]);
  });

  it("reports a revoked installation and acknowledges nothing", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(1, 2));
    const { outcome } = push(outbox, [{ kind: "revoked" }]);

    expect(await outcome).toEqual({ kind: "revoked" });
    expect(outbox.acknowledgedThrough).toEqual([]);
  });

  it("keeps the events and reports the failure when the cloud cannot be reached", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(1, 2));
    const { outcome } = push(outbox, [{ kind: "failed", failure: "offline" }]);

    expect(await outcome).toEqual({ kind: "failed", failure: "offline" });
    expect(outbox.acknowledgedThrough).toEqual([]);
    expect(outbox.events).toHaveLength(2);
  });

  it("keeps what an earlier batch got acknowledged when a later one fails", async () => {
    const outbox = new FakeLocalOutbox(eventsFrom(1, 250));
    const { outcome } = push(outbox, [
      { kind: "received", ackSeq: 200 },
      { kind: "failed", failure: "offline" },
    ]);

    expect(await outcome).toEqual({ kind: "failed", failure: "offline" });
    expect(outbox.acknowledgedThrough).toEqual([200]);
  });
});
