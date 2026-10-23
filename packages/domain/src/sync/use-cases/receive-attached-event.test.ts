import { describe, expect, it } from "vitest";
import { OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE } from "../../fiscal/index.js";
import type { PushedEvent } from "../model/push-batch.js";
import { receiveAttachedEvent } from "./receive-attached-event.js";
import { receivePushedEvents } from "./receive-pushed-events.js";
import { fakeEventChain } from "./test-support/fake-event-chain.js";
import {
  chainedFrom,
  FakeInbox,
  fakeEvent,
  unchainedFakeEvent,
} from "./test-support/fake-inbox.js";

const DEVICE = "device-1";
const NOW = new Date("2026-10-01T09:30:00.000Z");

function receiveAttached(inbox: FakeInbox, event: PushedEvent, deviceId = DEVICE) {
  return receiveAttachedEvent(
    { inbox, eventChain: fakeEventChain, clock: { now: () => NOW } },
    { deviceId, event },
  );
}

function push(inbox: FakeInbox, events: PushedEvent[]) {
  return receivePushedEvents(
    { inbox, eventChain: fakeEventChain, clock: { now: () => NOW } },
    {
      deviceId: DEVICE,
      appVersion: "1.4.0",
      telemetry: { wal_size_bytes: 1, disk_free_bytes: 1, disk_free_ratio: 0.5 },
      events,
    },
  );
}

describe("receiving an event a register attached to a request", () => {
  it("receives the first event of an installation", async () => {
    const inbox = new FakeInbox();

    const outcome = await receiveAttached(inbox, fakeEvent(1));

    expect(outcome).toEqual({ kind: "received" });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1]);
    expect(inbox.state.received[0]?.receivedAt).toEqual(NOW);
  });

  it("locks the installation before reading anything of it", async () => {
    const inbox = new FakeInbox();

    await receiveAttached(inbox, fakeEvent(1));

    expect(inbox.calls[0]).toBe("lockDevice device-1");
  });

  it("receives an event that follows the one the inbox holds", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);

    const outcome = await receiveAttached(inbox, fakeEvent(3));

    expect(outcome).toEqual({ kind: "received" });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 3]);
  });

  it("receives an event above a hole without checking its link", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);
    const aboveHole = fakeEvent(4);

    const outcome = await receiveAttached(inbox, aboveHole);

    expect(outcome).toEqual({ kind: "received" });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 4]);
  });

  it("receives an event above a hole even when its link could not be verified", async () => {
    const inbox = new FakeInbox();

    const outcome = await receiveAttached(inbox, { ...fakeEvent(5), chain_hmac: "unverifiable" });

    expect(outcome).toEqual({ kind: "received" });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([5]);
  });

  it("changes nothing when the same event was already received", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    const before = structuredClone(inbox.state);

    const outcome = await receiveAttached(inbox, fakeEvent(2));

    expect(outcome).toEqual({ kind: "already_received" });
    expect(inbox.state).toEqual(before);
  });

  it("is a no-op the second time the same event is attached", async () => {
    const inbox = new FakeInbox();
    await receiveAttached(inbox, fakeEvent(1));
    const before = structuredClone(inbox.state);

    const outcome = await receiveAttached(inbox, fakeEvent(1));

    expect(outcome).toEqual({ kind: "already_received" });
    expect(inbox.state).toEqual(before);
  });

  it("answers misplaced, changing nothing, when another event holds that sequence", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    const before = structuredClone(inbox.state);

    const outcome = await receiveAttached(inbox, fakeEvent(2, "another-event"));

    expect(outcome).toEqual({ kind: "misplaced" });
    expect(inbox.state).toEqual(before);
  });

  it("answers misplaced, changing nothing, when the event id is held at another sequence", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    const before = structuredClone(inbox.state);

    const outcome = await receiveAttached(inbox, fakeEvent(3, "event-2"));

    expect(outcome).toEqual({ kind: "misplaced" });
    expect(inbox.state).toEqual(before);
  });

  it("answers misplaced, changing nothing, when another installation holds the event id", async () => {
    const inbox = new FakeInbox([{ deviceId: "device-2", seqs: [1] }]);
    const before = structuredClone(inbox.state);

    const outcome = await receiveAttached(inbox, fakeEvent(1));

    expect(outcome).toEqual({ kind: "misplaced" });
    expect(inbox.state).toEqual(before);
  });

  it("answers chain_broken, changing nothing, when the link does not hold after the held predecessor", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    const before = structuredClone(inbox.state);

    const outcome = await receiveAttached(inbox, { ...fakeEvent(3), chain_hmac: "forged-link" });

    expect(outcome).toEqual({ kind: "chain_broken" });
    expect(inbox.state).toEqual(before);
  });

  it("answers chain_broken, changing nothing, when the first event's link does not hold", async () => {
    const inbox = new FakeInbox();

    const outcome = await receiveAttached(inbox, { ...fakeEvent(1), chain_hmac: "forged-link" });

    expect(outcome).toEqual({ kind: "chain_broken" });
    expect(inbox.state.received).toEqual([]);
  });

  it("answers chain_broken, changing nothing, when the event was altered after it was chained", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);
    const altered: PushedEvent = {
      ...fakeEvent(2),
      payload: { ...unchainedFakeEvent(2).payload, tampered: true },
    };

    const outcome = await receiveAttached(inbox, altered);

    expect(outcome).toEqual({ kind: "chain_broken" });
    expect(inbox.state.received).toHaveLength(1);
  });

  it("answers chain_broken when the installation's chain key is missing", async () => {
    const inbox = new FakeInbox();
    inbox.chainKeys.set(DEVICE, undefined);

    const outcome = await receiveAttached(inbox, fakeEvent(1));

    expect(outcome).toEqual({ kind: "chain_broken" });
    expect(inbox.state.received).toEqual([]);
  });

  it("neither sets the event aside nor revokes the installation when the chain is broken", async () => {
    const inbox = new FakeInbox();

    await receiveAttached(inbox, { ...fakeEvent(1), chain_hmac: "forged-link" });

    expect(inbox.state.refusedPushes).toEqual([]);
    expect(inbox.state.brokenChainRevocations).toEqual([]);
    expect(inbox.calls).not.toContain("setAsideRefusedPush device-1");
    expect(inbox.calls).not.toContain("revokeForBrokenChain device-1");
  });

  it("answers revoked, changing nothing, for a revoked installation", async () => {
    const inbox = new FakeInbox();
    inbox.revokedDevices.add(DEVICE);

    const outcome = await receiveAttached(inbox, fakeEvent(1));

    expect(outcome).toEqual({ kind: "revoked" });
    expect(inbox.state.received).toEqual([]);
  });

  it("advances the offline numbering for an offline fiscal document", async () => {
    const inbox = new FakeInbox();
    const offlineDocument = chainedFrom(null, {
      ...unchainedFakeEvent(1),
      event_type: OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE,
    });

    await receiveAttached(inbox, offlineDocument);

    expect(inbox.state.offlineNumberingAdvancedFor).toEqual([
      { eventId: offlineDocument.event_id, at: NOW },
    ]);
  });

  it("does not advance the offline numbering for any other event", async () => {
    const inbox = new FakeInbox();

    await receiveAttached(inbox, fakeEvent(1));

    expect(inbox.state.offlineNumberingAdvancedFor).toEqual([]);
  });

  it("records none of what a push records", async () => {
    const inbox = new FakeInbox();

    await receiveAttached(inbox, fakeEvent(1));

    expect(inbox.state.reports).toEqual([]);
    expect(inbox.state.versionStandings).toEqual([]);
    expect(inbox.state.registerStops).toEqual([]);
    expect(inbox.state.syncedRegisters).toEqual([]);
    expect(inbox.state.acceptedPushes).toEqual([]);
    expect(inbox.state.everyCycleReports).toEqual([]);
    expect(inbox.state.caughtUps).toEqual([]);
  });

  it("leaves the later push of the same event, with its predecessors, receiving it once and acknowledging it", async () => {
    const inbox = new FakeInbox();
    await receiveAttached(inbox, fakeEvent(3));

    const outcome = await push(inbox, [fakeEvent(1), fakeEvent(2), fakeEvent(3)]);

    expect(outcome).toEqual({ kind: "received", ackSeq: 3 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([3, 1, 2]);
  });

  it("lets the push that fills the hole refuse a held event whose link no longer holds", async () => {
    const inbox = new FakeInbox();
    await receiveAttached(inbox, { ...fakeEvent(2), chain_hmac: "unverifiable" });

    const outcome = await push(inbox, [
      fakeEvent(1),
      { ...fakeEvent(2), chain_hmac: "unverifiable" },
    ]);

    expect(outcome).toEqual({ kind: "chain_broken" });
  });
});
