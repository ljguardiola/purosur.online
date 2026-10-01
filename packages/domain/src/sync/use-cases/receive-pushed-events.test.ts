import { describe, expect, it } from "vitest";
import type { PushedEvent, RegisterTelemetry } from "../model/push-batch.js";
import { type ReceivePushedEventsInput, receivePushedEvents } from "./receive-pushed-events.js";
import { FakeInbox, fakeEvent } from "./test-support/fake-inbox.js";

const DEVICE = "device-1";
const OTHER_DEVICE = "device-2";
const NOW = new Date("2026-10-01T09:30:00.000Z");
const TELEMETRY: RegisterTelemetry = {
  wal_size_bytes: 4096,
  disk_free_bytes: 50_000_000,
  disk_free_ratio: 0.42,
};

function eventsOf(...seqs: number[]): PushedEvent[] {
  return seqs.map((seq) => fakeEvent(seq));
}

function receive(
  inbox: FakeInbox,
  events: PushedEvent[],
  overrides: Partial<ReceivePushedEventsInput> = {},
) {
  return receivePushedEvents(
    { inbox, clock: { now: () => NOW } },
    { deviceId: DEVICE, appVersion: "1.4.0", telemetry: TELEMETRY, events, ...overrides },
  );
}

describe("receiving the events a register pushes", () => {
  it("locks the installation before reading anything of it", async () => {
    const inbox = new FakeInbox();

    await receive(inbox, eventsOf(1));

    expect(inbox.calls[0]).toBe("lockDevice device-1");
  });

  it("receives the first events of an installation and acknowledges them", async () => {
    const inbox = new FakeInbox();

    const outcome = await receive(inbox, eventsOf(1, 2, 3));

    expect(outcome).toEqual({ kind: "received", ackSeq: 3 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 3]);
    expect(inbox.state.received.every((entry) => entry.receivedAt === NOW)).toBe(true);
  });

  it("continues right after what it already holds", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);

    const outcome = await receive(inbox, eventsOf(3, 4));

    expect(outcome).toEqual({ kind: "received", ackSeq: 4 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 3, 4]);
  });

  it("answers the ack recalculated from the inbox, not from what this batch walked", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2, 4] }]);

    const outcome = await receive(inbox, eventsOf(3));

    expect(outcome).toEqual({ kind: "received", ackSeq: 4 });
  });

  it("does not store again an event it holds beyond a hole that this batch fills", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2, 4] }]);

    const outcome = await receive(inbox, eventsOf(3, 4, 5));

    expect(outcome).toEqual({ kind: "received", ackSeq: 5 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 4, 3, 5]);
  });

  it("refuses the batch as a stale device when it fills a hole next to a held device_seq with another event", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2, 4] }]);

    const outcome = await receive(inbox, [fakeEvent(3), fakeEvent(4, "another-event")]);

    expect(outcome).toEqual({ kind: "stale_device", ackSeq: 2 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 4]);
  });

  it("keeps the events of each installation apart", async () => {
    const inbox = new FakeInbox([{ deviceId: OTHER_DEVICE, seqs: [1, 2, 3] }]);

    const outcome = await receive(inbox, eventsOf(1));

    expect(outcome).toEqual({ kind: "received", ackSeq: 1 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1]);
    expect(inbox.receivedSeqs(OTHER_DEVICE)).toEqual([1, 2, 3]);
  });

  it("skips the events it already holds and receives the rest of the batch", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2, 3, 4, 5] }]);

    const outcome = await receive(inbox, eventsOf(4, 5, 6, 7));

    expect(outcome).toEqual({ kind: "received", ackSeq: 7 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("answers the current ack to a batch it already holds entirely", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2, 3] }]);

    const outcome = await receive(inbox, eventsOf(2, 3));

    expect(outcome).toEqual({ kind: "received", ackSeq: 3 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 3]);
  });

  it("stores a device_seq repeated inside the batch once", async () => {
    const inbox = new FakeInbox();

    const outcome = await receive(inbox, [...eventsOf(1, 2), fakeEvent(2)]);

    expect(outcome).toEqual({ kind: "received", ackSeq: 2 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2]);
  });

  it("refuses the batch as a stale device when a held device_seq arrives with another event", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2, 3] }]);

    const outcome = await receive(inbox, [fakeEvent(2, "another-event"), ...eventsOf(4)]);

    expect(outcome).toEqual({ kind: "stale_device", ackSeq: 3 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 3]);
  });

  it("refuses the batch as a stale device when a device_seq repeats inside it with another event", async () => {
    const inbox = new FakeInbox();

    const outcome = await receive(inbox, [fakeEvent(1), fakeEvent(1, "another-event")]);

    expect(outcome).toEqual({ kind: "stale_device", ackSeq: 0 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([]);
  });

  it("refuses the whole batch with the device_seq it expects when one is ahead of it", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);

    const outcome = await receive(inbox, eventsOf(5, 6));

    expect(outcome).toEqual({ kind: "gap", ackSeq: 2, expectedSeq: 3 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2]);
  });

  it("receives nothing of a batch whose gap comes after contiguous events", async () => {
    const inbox = new FakeInbox();

    const outcome = await receive(inbox, eventsOf(1, 2, 4));

    expect(outcome).toEqual({ kind: "gap", ackSeq: 0, expectedSeq: 3 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([]);
  });

  it("does not count the events it already holds when it looks for a gap", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2, 3] }]);

    const outcome = await receive(inbox, eventsOf(2, 3, 5));

    expect(outcome).toEqual({ kind: "gap", ackSeq: 3, expectedSeq: 4 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 3]);
  });

  it("expects the first device_seq from an installation that has sent nothing", async () => {
    const inbox = new FakeInbox();

    const outcome = await receive(inbox, eventsOf(2));

    expect(outcome).toEqual({ kind: "gap", ackSeq: 0, expectedSeq: 1 });
  });

  it("records the app version and the telemetry of every push, whatever its outcome", async () => {
    const received = new FakeInbox();
    const gap = new FakeInbox();
    const stale = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);

    await receive(received, eventsOf(1));
    await receive(gap, eventsOf(3));
    await receive(stale, [fakeEvent(1, "another-event")]);

    const report = { deviceId: DEVICE, appVersion: "1.4.0", telemetry: TELEMETRY, at: NOW };
    expect(received.state.reports).toEqual([report]);
    expect(gap.state.reports).toEqual([report]);
    expect(stale.state.reports).toEqual([report]);
  });

  it("leaves nothing behind when receiving fails", async () => {
    const inbox = new FakeInbox();
    inbox.failReceiving = true;

    await expect(receive(inbox, eventsOf(1))).rejects.toThrow("the inbox could not be written");

    expect(inbox.state).toEqual({ received: [], reports: [] });
  });
});
