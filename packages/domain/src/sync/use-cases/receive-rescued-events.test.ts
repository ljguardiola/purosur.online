import { describe, expect, it } from "vitest";
import { OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE } from "../../fiscal/index.js";
import type { PushedEvent } from "../model/push-batch.js";
import { receiveRescuedEvents } from "./receive-rescued-events.js";
import { FakeInbox, fakeEvent } from "./test-support/fake-inbox.js";

const REGISTER = "register-1";
const DEVICE = "device-1";
const NOW = new Date("2026-10-01T09:30:00.000Z");

function rescue(inbox: FakeInbox, events: PushedEvent[], registerId = REGISTER) {
  return receiveRescuedEvents(
    { inbox, clock: { now: () => NOW } },
    { registerId, deviceId: DEVICE, events },
  );
}

function inboxOfRegister(...held: { seqs: number[] }[]): FakeInbox {
  const inbox = new FakeInbox(held.map(({ seqs }) => ({ deviceId: DEVICE, seqs })));
  inbox.registerIds.set(DEVICE, REGISTER);
  return inbox;
}

function offlineDocument(deviceSeq: number): PushedEvent {
  return { ...fakeEvent(deviceSeq), event_type: OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE };
}

describe("receiving the events of rescued contingency tickets", () => {
  it("receives the events the inbox does not hold and counts them", async () => {
    const inbox = inboxOfRegister();

    const outcome = await rescue(inbox, [fakeEvent(1), fakeEvent(2)]);

    expect(outcome).toEqual({ kind: "received", received: 2, alreadyReceived: 0 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2]);
    expect(inbox.state.received.map((entry) => entry.receivedAt)).toEqual([NOW, NOW]);
  });

  it("locks the installation before reading anything of it", async () => {
    const inbox = inboxOfRegister();

    await rescue(inbox, [fakeEvent(1)]);

    expect(inbox.calls[0]).toBe("lockDevice device-1");
  });

  it("receives nothing when there are no events", async () => {
    const inbox = inboxOfRegister();

    const outcome = await rescue(inbox, []);

    expect(outcome).toEqual({ kind: "received", received: 0, alreadyReceived: 0 });
    expect(inbox.state.received).toEqual([]);
  });

  it("counts the events it already holds without receiving them again", async () => {
    const inbox = inboxOfRegister({ seqs: [1, 2] });

    const outcome = await rescue(inbox, [fakeEvent(2), fakeEvent(3)]);

    expect(outcome).toEqual({ kind: "received", received: 1, alreadyReceived: 1 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 3]);
  });

  it("receives nothing new when the same tickets are rescued twice", async () => {
    const inbox = inboxOfRegister();
    await rescue(inbox, [fakeEvent(1), fakeEvent(2)]);

    const outcome = await rescue(inbox, [fakeEvent(1), fakeEvent(2)]);

    expect(outcome).toEqual({ kind: "received", received: 0, alreadyReceived: 2 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2]);
  });

  it("counts an event repeated within the same rescue once", async () => {
    const inbox = inboxOfRegister();

    const outcome = await rescue(inbox, [fakeEvent(1), fakeEvent(1)]);

    expect(outcome).toEqual({ kind: "received", received: 1, alreadyReceived: 1 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1]);
  });

  it("receives events from an installation that was revoked", async () => {
    const inbox = inboxOfRegister();
    inbox.revokedDevices.add(DEVICE);

    const outcome = await rescue(inbox, [fakeEvent(1)]);

    expect(outcome).toEqual({ kind: "received", received: 1, alreadyReceived: 0 });
    expect(inbox.calls).not.toContain("installationRevoked device-1");
  });

  it("receives events whose chain link cannot be verified", async () => {
    const inbox = inboxOfRegister();
    inbox.chainKeys.set(DEVICE, undefined);

    const outcome = await rescue(inbox, [{ ...fakeEvent(1), chain_hmac: "unverifiable" }]);

    expect(outcome).toEqual({ kind: "received", received: 1, alreadyReceived: 0 });
    expect(inbox.calls).not.toContain("outboxChainKey device-1");
    expect(inbox.state.brokenChainRevocations).toEqual([]);
  });

  it("receives events above a hole, whatever the missing tickets", async () => {
    const inbox = inboxOfRegister({ seqs: [1] });

    const outcome = await rescue(inbox, [fakeEvent(5), fakeEvent(9)]);

    expect(outcome).toEqual({ kind: "received", received: 2, alreadyReceived: 0 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 5, 9]);
  });

  it("advances the offline numbering only for the offline vouchers it receives", async () => {
    const inbox = inboxOfRegister({ seqs: [] });
    inbox.holdEvents(DEVICE, offlineDocument(1));

    await rescue(inbox, [offlineDocument(1), fakeEvent(2), offlineDocument(3)]);

    expect(inbox.state.offlineNumberingAdvancedFor).toEqual([{ eventId: "event-3", at: NOW }]);
  });

  it("refuses an installation of another register and receives nothing", async () => {
    const inbox = inboxOfRegister();

    const outcome = await rescue(inbox, [offlineDocument(1)], "another-register");

    expect(outcome).toEqual({ kind: "foreign_installation" });
    expect(inbox.state.received).toEqual([]);
    expect(inbox.state.offlineNumberingAdvancedFor).toEqual([]);
  });

  it("receives nothing when an event conflicts with the one the inbox holds at its place", async () => {
    const inbox = inboxOfRegister({ seqs: [1] });

    const outcome = await rescue(inbox, [fakeEvent(2), fakeEvent(1, "another-event")]);

    expect(outcome).toEqual({ kind: "conflicting" });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1]);
    expect(inbox.state.offlineNumberingAdvancedFor).toEqual([]);
  });

  it("receives nothing when an event is held by the inbox somewhere else", async () => {
    const inbox = inboxOfRegister();
    inbox.holdEvents("device-2", fakeEvent(7, "event-2"));

    const outcome = await rescue(inbox, [fakeEvent(1), fakeEvent(2)]);

    expect(outcome).toEqual({ kind: "conflicting" });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([]);
  });

  it("receives nothing when two events of the rescue claim the same place", async () => {
    const inbox = inboxOfRegister();

    const outcome = await rescue(inbox, [fakeEvent(1), fakeEvent(1, "another-event")]);

    expect(outcome).toEqual({ kind: "conflicting" });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([]);
  });

  it("receives nothing when one event of the rescue claims two places", async () => {
    const inbox = inboxOfRegister();

    const outcome = await rescue(inbox, [fakeEvent(1, "same-event"), fakeEvent(2, "same-event")]);

    expect(outcome).toEqual({ kind: "conflicting" });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([]);
  });
});
