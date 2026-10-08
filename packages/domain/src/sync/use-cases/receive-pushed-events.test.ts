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

async function pushReceivedBy(
  inbox: FakeInbox,
  events: PushedEvent[],
  overrides: Partial<ReceivePushedEventsInput> = {},
): Promise<FakeInbox> {
  await receive(inbox, events, overrides);
  return inbox;
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
      observedConditions: [],
      acceptedPushes: [],
      everyCycleReports: [],
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

  it("needs no chain key to answer the ack of a push that carries no event", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    inbox.chainKeys.set(DEVICE, undefined);

    const outcome = await receive(inbox, []);

    expect(outcome).toEqual({ kind: "received", ackSeq: 2 });
    expect(inbox.state.brokenChainRevocations).toEqual([]);
  });

  it("keeps the events of each installation apart", async () => {
    const inbox = new FakeInbox();
    inbox.holdEvents(
      OTHER_DEVICE,
      ...[1, 2, 3].map((seq) => fakeEvent(seq, `other-installation-event-${seq}`)),
    );

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
      observedConditions: [],
      acceptedPushes: [],
      everyCycleReports: [],
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

describe("reporting how the register stands", () => {
  it("clears the update-required condition of the installation's register for an accepted version", async () => {
    const inbox = new FakeInbox();
    inbox.registerIds.set(DEVICE, "register-1");

    await receive(inbox, eventsOf(1), { appVersion: "1.4.0" });

    expect(inbox.state.observedConditions[0]).toEqual({
      observation: { holds: false, kind: "update_required", scope: "register-1" },
      at: NOW,
    });
  });

  it("clears the silent-register condition of the installation's register once it accepts the push", async () => {
    const inbox = new FakeInbox();
    inbox.registerIds.set(DEVICE, "register-1");

    await receive(inbox, eventsOf(1));

    expect(inbox.state.observedConditions.slice(1)).toEqual([
      { observation: { holds: false, kind: "register_silent", scope: "register-1" }, at: NOW },
    ]);
  });

  it("accepts a push of no events as a sync, clearing the silent-register condition", async () => {
    const inbox = new FakeInbox();
    inbox.registerIds.set(DEVICE, "register-1");

    const outcome = await receive(inbox, []);

    expect(outcome).toEqual({ kind: "received", ackSeq: 0 });
    expect(inbox.state.acceptedPushes).toEqual([{ deviceId: DEVICE, at: NOW }]);
    expect(inbox.state.observedConditions.map(({ observation }) => observation)).toContainEqual({
      holds: false,
      kind: "register_silent",
      scope: "register-1",
    });
  });

  it("clears the silent-register condition right after recording the accepted push", async () => {
    const inbox = new FakeInbox();

    await receive(inbox, eventsOf(1));

    const calls = inbox.calls;
    expect(calls.lastIndexOf("observeAlertCondition")).toBe(
      calls.indexOf("recordAcceptedPush device-1") + 1,
    );
  });

  it("leaves the silent-register condition alone for a push it does not accept", async () => {
    const notAccepted = [
      await pushReceivedBy(new FakeInbox(), eventsOf(3)),
      await pushReceivedBy(new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]), [
        { ...fakeEvent(1), event_id: "another-event" },
      ]),
      await pushReceivedBy(new FakeInbox(), [{ ...fakeEvent(1), chain_hmac: "forged-link" }]),
      await pushReceivedBy(new FakeInbox(), eventsOf(1), { appVersion: "not-a-version" }),
    ];

    for (const inbox of notAccepted) {
      expect(
        inbox.state.observedConditions.filter(({ observation }) =>
          observation.holds
            ? observation.alert.kind === "register_silent"
            : observation.kind === "register_silent",
        ),
      ).toEqual([]);
    }
  });

  it("records that the installation reports on every sync cycle once it accepts a push of no events", async () => {
    const inbox = new FakeInbox();

    await receive(inbox, []);

    expect(inbox.state.everyCycleReports).toEqual([{ deviceId: DEVICE, at: NOW }]);
  });

  it("records no every-cycle report for a push that carries events", async () => {
    const inbox = new FakeInbox();

    await receive(inbox, eventsOf(1));

    expect(inbox.state.everyCycleReports).toEqual([]);
  });

  it("records no every-cycle report for a push of no events it does not accept", async () => {
    const revoked = new FakeInbox();
    revoked.revokedDevices.add(DEVICE);
    const notAccepted = [
      await pushReceivedBy(revoked, []),
      await pushReceivedBy(new FakeInbox(), [], { appVersion: "not-a-version" }),
    ];

    for (const inbox of notAccepted) {
      expect(inbox.state.everyCycleReports).toEqual([]);
    }
  });

  it("holds the update-required condition of the installation's register, naming the device and the version, for a version that is not accepted", async () => {
    const inbox = new FakeInbox();
    inbox.registerIds.set(DEVICE, "register-1");

    await receive(inbox, eventsOf(1), { appVersion: "not-a-version" });

    expect(inbox.state.observedConditions).toEqual([
      {
        observation: {
          holds: true,
          alert: {
            kind: "update_required",
            scope: "register-1",
            detail: { deviceId: DEVICE, appVersion: "not-a-version" },
          },
        },
        at: NOW,
      },
    ]);
  });

  it("observes the version right after recording the push report, before looking at the events", async () => {
    const inbox = new FakeInbox();

    await receive(inbox, eventsOf(1));

    const calls = inbox.calls;
    expect(calls.indexOf("installationRegisterId device-1")).toBe(
      calls.indexOf("recordPushReport device-1") + 1,
    );
    expect(calls.indexOf("observeAlertCondition")).toBe(
      calls.indexOf("installationRegisterId device-1") + 1,
    );
    expect(calls.indexOf("observeAlertCondition")).toBeLessThan(
      calls.indexOf("receivedDeviceSeqs device-1"),
    );
  });

  it("observes the version of a push it refuses for a gap, a stale device or a broken chain", async () => {
    const gap = new FakeInbox();
    await receive(gap, eventsOf(3));
    const stale = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);
    await receive(stale, [{ ...fakeEvent(1), event_id: "another-event" }]);
    const broken = new FakeInbox();
    await receive(broken, [{ ...fakeEvent(1), chain_hmac: "forged-link" }]);

    for (const inbox of [gap, stale, broken]) {
      expect(inbox.state.observedConditions).toEqual([
        {
          observation: { holds: false, kind: "update_required", scope: "register-of-device-1" },
          at: NOW,
        },
      ]);
    }
  });

  it("observes nothing of a revoked installation", async () => {
    const inbox = new FakeInbox();
    inbox.revokedDevices.add(DEVICE);

    await receive(inbox, eventsOf(1));

    expect(inbox.state.observedConditions).toEqual([]);
    expect(inbox.state.acceptedPushes).toEqual([]);
  });

  it("records the moment of a push it received, after receiving it", async () => {
    const inbox = new FakeInbox();

    await receive(inbox, eventsOf(1));

    expect(inbox.state.acceptedPushes).toEqual([{ deviceId: DEVICE, at: NOW }]);
    expect(inbox.calls.indexOf("recordAcceptedPush device-1")).toBeGreaterThan(
      inbox.calls.indexOf("receive device-1"),
    );
  });

  it("records the moment of a received push that carries no event", async () => {
    const inbox = new FakeInbox();

    await receive(inbox, []);

    expect(inbox.state.acceptedPushes).toEqual([{ deviceId: DEVICE, at: NOW }]);
  });

  it.each([
    ["a gap", () => ({ inbox: new FakeInbox(), events: eventsOf(3), appVersion: "1.4.0" })],
    [
      "a stale device",
      () => ({
        inbox: new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]),
        events: [{ ...fakeEvent(1), event_id: "another-event" }],
        appVersion: "1.4.0",
      }),
    ],
    [
      "a broken chain",
      () => ({
        inbox: new FakeInbox(),
        events: [{ ...fakeEvent(1), chain_hmac: "forged-link" }],
        appVersion: "1.4.0",
      }),
    ],
    [
      "a version that is not accepted",
      () => ({ inbox: new FakeInbox(), events: eventsOf(1), appVersion: "not-a-version" }),
    ],
  ])("does not record the moment of a push refused for %s", async (_name, build) => {
    const { inbox, events, appVersion } = build();

    await receive(inbox, events, { appVersion });

    expect(inbox.state.acceptedPushes).toEqual([]);
  });
});

describe("an event a register pushes again", () => {
  const REFUSED = { kind: "chain_broken" };

  function expectBrokenChain(inbox: FakeInbox, pushed: PushedEvent[], heldSeqs: number[]) {
    expect(inbox.receivedSeqs(DEVICE)).toEqual(heldSeqs);
    expect(inbox.state.refusedPushes).toEqual([
      { deviceId: DEVICE, events: pushed, refusedAt: NOW },
    ]);
    expect(inbox.state.brokenChainRevocations).toEqual([{ deviceId: DEVICE, revokedAt: NOW }]);
  }

  it("is skipped when it is identical to the one held, storing nothing again and revoking nothing", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2, 3] }]);

    const outcome = await receive(inbox, eventsOf(2, 3));

    expect(outcome).toEqual({ kind: "received", ackSeq: 3 });
    expect(inbox.receivedSeqs(DEVICE)).toEqual([1, 2, 3]);
    expect(inbox.state.refusedPushes).toEqual([]);
    expect(inbox.state.brokenChainRevocations).toEqual([]);
  });

  it("is skipped when its first copy of the batch is repeated identically inside it", async () => {
    const inbox = new FakeInbox();

    const outcome = await receive(inbox, [...eventsOf(1, 2), fakeEvent(2)]);

    expect(outcome).toEqual({ kind: "received", ackSeq: 2 });
    expect(inbox.state.brokenChainRevocations).toEqual([]);
  });

  it("breaks the chain when it arrives with altered content, receiving none of the batch", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    const pushed = [fakeEvent(1), { ...fakeEvent(2), payload: { seq: 99 } }, fakeEvent(3)];

    const outcome = await receive(inbox, pushed);

    expect(outcome).toEqual(REFUSED);
    expectBrokenChain(inbox, pushed, [1, 2]);
  });

  it("breaks the chain when it arrives with a link other than the one held", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    const pushed = [{ ...fakeEvent(2), chain_hmac: "another-link" }, fakeEvent(3)];

    const outcome = await receive(inbox, pushed);

    expect(outcome).toEqual(REFUSED);
    expectBrokenChain(inbox, pushed, [1, 2]);
  });

  it("breaks the chain when the first event of an installation arrives again altered", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1] }]);
    const pushed = [{ ...fakeEvent(1), actor_id: "someone-else" }];

    const outcome = await receive(inbox, pushed);

    expect(outcome).toEqual(REFUSED);
    expectBrokenChain(inbox, pushed, [1]);
  });

  it("breaks the chain when the copy repeated inside the batch differs from the first", async () => {
    const inbox = new FakeInbox();
    const pushed = [fakeEvent(1), { ...fakeEvent(1), payload: { seq: 99 } }];

    const outcome = await receive(inbox, pushed);

    expect(outcome).toEqual(REFUSED);
    expectBrokenChain(inbox, pushed, []);
  });

  it("breaks the chain when it arrives at another position of the same installation", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    const pushed = [fakeEvent(3, "event-1")];

    const outcome = await receive(inbox, pushed);

    expect(outcome).toEqual(REFUSED);
    expectBrokenChain(inbox, pushed, [1, 2]);
  });

  it("breaks the chain when its id is already held for another installation", async () => {
    const inbox = new FakeInbox([{ deviceId: OTHER_DEVICE, seqs: [1] }]);
    const pushed = [fakeEvent(1, "event-1")];

    const outcome = await receive(inbox, pushed);

    expect(outcome).toEqual(REFUSED);
    expectBrokenChain(inbox, pushed, []);
    expect(inbox.receivedSeqs(OTHER_DEVICE)).toEqual([1]);
  });

  it("breaks the chain when its id comes twice in the batch at different positions", async () => {
    const inbox = new FakeInbox();
    const pushed = [fakeEvent(1), fakeEvent(2, "event-1")];

    const outcome = await receive(inbox, pushed);

    expect(outcome).toEqual(REFUSED);
    expectBrokenChain(inbox, pushed, []);
  });

  it("breaks the chain when the installation has no chain key to show the held copy was not altered", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);
    inbox.chainKeys.set(DEVICE, undefined);
    const pushed = eventsOf(1, 2);

    const outcome = await receive(inbox, pushed);

    expect(outcome).toEqual(REFUSED);
    expectBrokenChain(inbox, pushed, [1, 2]);
  });

  it("is answered as a stale device when its position holds another event, even beside one that would break the chain", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);

    const outcome = await receive(inbox, [fakeEvent(1, "event-2"), fakeEvent(2, "another-event")]);

    expect(outcome).toEqual({ kind: "stale_device", ackSeq: 2 });
    expect(inbox.state.brokenChainRevocations).toEqual([]);
  });

  it("is answered as a gap when one comes ahead, even beside one that would break the chain", async () => {
    const inbox = new FakeInbox([{ deviceId: DEVICE, seqs: [1, 2] }]);

    const outcome = await receive(inbox, [{ ...fakeEvent(2), payload: { seq: 99 } }, fakeEvent(5)]);

    expect(outcome).toEqual({ kind: "gap", ackSeq: 2, expectedSeq: 3 });
    expect(inbox.state.brokenChainRevocations).toEqual([]);
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
