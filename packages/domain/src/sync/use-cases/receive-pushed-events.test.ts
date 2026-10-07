import { describe, expect, it } from "vitest";
import type { PushedEvent, RegisterTelemetry } from "../model/push-batch.js";
import { type ReceivePushedEventsInput, receivePushedEvents } from "./receive-pushed-events.js";
import { fakeEventChain } from "./test-support/fake-event-chain.js";
import {
  chainedFrom,
  FakeInbox,
  fakeEvent,
  unchainedFakeEvent,
} from "./test-support/fake-inbox.js";

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
    { inbox, eventChain: fakeEventChain, clock: { now: () => NOW } },
    { deviceId: DEVICE, appVersion: "1.4.0", telemetry: TELEMETRY, events, ...overrides },
  );
}

describe("receiving the events a register pushes", () => {
  it("locks the installation before reading anything of it", async () => {
    const inbox = new FakeInbox();

    await receive(inbox, eventsOf(1));

    expect(inbox.calls[0]).toBe("lockDevice device-1");
  });

  it("answers revoked to an installation revoked while its push waited for the lock, recording nothing", async () => {
    const inbox = new FakeInbox();
    inbox.revokedDevices.add(DEVICE);

    const outcome = await receive(inbox, [{ ...fakeEvent(1), chain_hmac: "forged-link" }]);

    expect(outcome).toEqual({ kind: "revoked" });
    expect(inbox.state).toEqual({
      received: [],
      reports: [],
      refusedPushes: [],
      brokenChainRevocations: [],
    });
  });

  it("reads whether the installation is revoked right after locking it", async () => {
    const inbox = new FakeInbox();

    await receive(inbox, eventsOf(1));

    expect(inbox.calls.slice(0, 2)).toEqual([
      "lockDevice device-1",
      "installationRevoked device-1",
    ]);
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

    expect(inbox.state).toEqual({
      received: [],
      reports: [],
      refusedPushes: [],
      brokenChainRevocations: [],
    });
  });
});

describe("requiring a register version", () => {
  it("answers update_required to a version that is not accepted, with the ack it already holds and receiving nothing", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2, 4] }]);

    const outcome = await receive(inbox, eventsOf(3), { appVersion: "not-a-version" });

    expect(outcome).toEqual({ kind: "update_required", ackSeq: 2 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 4]);
  });

  it("still records the version and the telemetry the register reported", async () => {
    const inbox = new FakeInbox();

    await receive(inbox, eventsOf(1), { appVersion: "not-a-version" });

    expect(inbox.state.reports).toEqual([
      { deviceId: DEVICE, appVersion: "not-a-version", telemetry: TELEMETRY, at: NOW },
    ]);
  });

  it("answers update_required before looking at the events, even when they would break the chain", async () => {
    const inbox = new FakeInbox();

    const outcome = await receive(inbox, [{ ...fakeEvent(3), chain_hmac: "forged-link" }], {
      appVersion: "1.4",
    });

    expect(outcome).toEqual({ kind: "update_required", ackSeq: 0 });
    expect(inbox.state.refusedPushes).toEqual([]);
    expect(inbox.state.brokenChainRevocations).toEqual([]);
  });

  it("answers revoked to a revoked installation before looking at its version", async () => {
    const inbox = new FakeInbox();
    inbox.revokedDevices.add(DEVICE);

    const outcome = await receive(inbox, eventsOf(1), { appVersion: "1.4" });

    expect(outcome).toEqual({ kind: "revoked" });
    expect(inbox.state.reports).toEqual([]);
  });

  it("receives the push of an accepted version", async () => {
    const inbox = new FakeInbox();

    const outcome = await receive(inbox, eventsOf(1), { appVersion: "0.0.0" });

    expect(outcome).toEqual({ kind: "received", ackSeq: 1 });
  });
});

describe("checking the chain of the events a register pushes", () => {
  const REFUSED = { kind: "chain_broken" };

  it("receives events that each chain from the one before", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);

    const outcome = await receive(inbox, eventsOf(3, 4, 5));

    expect(outcome).toEqual({ kind: "received", ackSeq: 5 });
    expect(inbox.state.refusedPushes).toEqual([]);
    expect(inbox.state.brokenChainRevocations).toEqual([]);
  });

  it("refuses a whole push holding an altered event, receiving none of it", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);
    const altered = { ...fakeEvent(2), payload: { seq: 99 } };

    const outcome = await receive(inbox, [altered, fakeEvent(3)]);

    expect(outcome).toEqual(REFUSED);
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1]);
  });

  it("keeps the refused push's events aside and revokes the installation for its broken chain", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);
    const pushed = [{ ...fakeEvent(2), payload: { seq: 99 } }, fakeEvent(3)];

    await receive(inbox, pushed);

    expect(inbox.state.refusedPushes).toEqual([
      { deviceId: DEVICE, events: pushed, refusedAt: NOW },
    ]);
    expect(inbox.state.brokenChainRevocations).toEqual([{ deviceId: DEVICE, revokedAt: NOW }]);
  });

  it("keeps aside every event of the refused push, the ones it already holds included", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    const pushed = [fakeEvent(2), { ...fakeEvent(3), payload: { seq: 99 } }];

    await receive(inbox, pushed);

    expect(inbox.state.refusedPushes).toEqual([
      { deviceId: DEVICE, events: pushed, refusedAt: NOW },
    ]);
  });

  it("refuses a push where an event was removed and the ones after it renumbered", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);

    const outcome = await receive(inbox, [
      { ...fakeEvent(3), device_seq: 2 },
      { ...fakeEvent(4), device_seq: 3 },
    ]);

    expect(outcome).toEqual(REFUSED);
  });

  it("refuses a push where two events were swapped", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);

    const outcome = await receive(inbox, [
      { ...fakeEvent(3), device_seq: 2 },
      { ...fakeEvent(2), device_seq: 3 },
    ]);

    expect(outcome).toEqual(REFUSED);
  });

  it("refuses a push whose break comes after events that chain well", async () => {
    const inbox = new FakeInbox();

    const outcome = await receive(inbox, [
      fakeEvent(1),
      fakeEvent(2),
      { ...fakeEvent(3), chain_hmac: "forged-link" },
    ]);

    expect(outcome).toEqual(REFUSED);
    expect(inbox.receivedSeqs(DEVICE)).toEqual([]);
  });

  it("chains the first event of an installation from the origin", async () => {
    const inbox = new FakeInbox();

    const outcome = await receive(inbox, [chainedFrom("some-link", unchainedFakeEvent(1))]);

    expect(outcome).toEqual(REFUSED);
  });

  it("chains the first event of a push from the link the inbox holds for the event before", async () => {
    const held = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    const fromOrigin = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);

    const chained = await receive(held, [
      chainedFrom(fakeEvent(2).chain_hmac, unchainedFakeEvent(3)),
    ]);
    const unchained = await receive(fromOrigin, [chainedFrom(null, unchainedFakeEvent(3))]);

    expect(chained).toEqual({ kind: "received", ackSeq: 3 });
    expect(unchained).toEqual(REFUSED);
  });

  it("checks the chain with the key of the installation that pushes", async () => {
    const ownKey = new FakeInbox();
    ownKey.chainKeys.set(DEVICE, "chain-key-2");
    const otherKey = new FakeInbox();
    otherKey.chainKeys.set(DEVICE, "chain-key-2");
    const first = chainedFrom(null, unchainedFakeEvent(1), "chain-key-2");

    const chainedWithOwnKey = await receive(ownKey, [
      first,
      chainedFrom(first.chain_hmac, unchainedFakeEvent(2), "chain-key-2"),
    ]);
    const chainedWithAnotherKey = await receive(otherKey, [first, fakeEvent(2)]);

    expect(chainedWithOwnKey).toEqual({ kind: "received", ackSeq: 2 });
    expect(chainedWithAnotherKey).toEqual(REFUSED);
  });

  it("refuses a push from an installation that has no chain key", async () => {
    const inbox = new FakeInbox();
    inbox.chainKeys.set(DEVICE, undefined);

    const outcome = await receive(inbox, eventsOf(1, 2));

    expect(outcome).toEqual(REFUSED);
    expect(inbox.receivedSeqs(DEVICE)).toEqual([]);
  });

  it("receives a push of events it already holds from an installation that has no chain key", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    inbox.chainKeys.set(DEVICE, undefined);

    const outcome = await receive(inbox, eventsOf(1, 2));

    expect(outcome).toEqual({ kind: "received", ackSeq: 2 });
  });

  it("does not check again an event it already holds", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);

    const outcome = await receive(inbox, [
      { ...fakeEvent(2), chain_hmac: "another-link" },
      fakeEvent(3),
    ]);

    expect(outcome).toEqual({ kind: "received", ackSeq: 3 });
  });

  it("checks nothing of a push it refuses for a gap or a stale device", async () => {
    const gap = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);
    const stale = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);

    await receive(gap, [{ ...fakeEvent(3), chain_hmac: "forged-link" }]);
    await receive(stale, [{ ...fakeEvent(1, "another-event"), chain_hmac: "forged-link" }]);

    expect(gap.state.brokenChainRevocations).toEqual([]);
    expect(stale.state.brokenChainRevocations).toEqual([]);
  });

  it("checks the chain only after locking the installation", async () => {
    const inbox = new FakeInbox();

    await receive(inbox, eventsOf(1));

    expect(inbox.calls.indexOf("outboxChainKey device-1")).toBeGreaterThan(
      inbox.calls.indexOf("lockDevice device-1"),
    );
  });

  it("answers revoked to the push after the one whose chain broke, receiving nothing of it", async () => {
    const inbox = new FakeInbox();
    await receive(inbox, [{ ...fakeEvent(1), chain_hmac: "forged-link" }]);

    const outcome = await receive(inbox, eventsOf(1));

    expect(outcome).toEqual({ kind: "revoked" });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([]);
    expect(inbox.state.refusedPushes).toHaveLength(1);
    expect(inbox.state.brokenChainRevocations).toHaveLength(1);
  });

  it("leaves nothing aside and revokes nothing when keeping the refused push fails", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);
    inbox.failSettingAside = true;

    await expect(receive(inbox, [{ ...fakeEvent(2), chain_hmac: "forged-link" }])).rejects.toThrow(
      "the refused push could not be kept",
    );

    expect(inbox.state.refusedPushes).toEqual([]);
    expect(inbox.state.brokenChainRevocations).toEqual([]);
  });
});
