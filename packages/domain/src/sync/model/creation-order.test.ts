import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type CreationOrderFields, inCreationOrder } from "./creation-order.js";

function event(
  eventId: string,
  deviceId: string,
  deviceSeq: number,
  occurredAt: string,
  receivedAt = "2026-10-07T00:00:00.000Z",
): CreationOrderFields {
  return {
    eventId,
    deviceId,
    deviceSeq,
    occurredAt: new Date(occurredAt),
    receivedAt: new Date(receivedAt),
  };
}

const ids = (events: readonly CreationOrderFields[]) => events.map((held) => held.eventId);

describe("the order events of one aggregate were created in", () => {
  it("follows the sequence of the installation for events of one installation", () => {
    const later = event("a", "register-1", 5, "2026-10-07T10:00:00.000Z");
    const earlier = event("b", "register-1", 4, "2026-10-07T11:00:00.000Z");

    expect(ids(inCreationOrder([later, earlier]))).toEqual(["b", "a"]);
  });

  it("follows when they happened for events of different installations", () => {
    const first = event("a", "register-2", 9, "2026-10-07T10:00:00.000Z");
    const second = event("b", "register-1", 1, "2026-10-07T10:00:01.000Z");

    expect(ids(inCreationOrder([second, first]))).toEqual(["a", "b"]);
  });

  it("follows when the cloud received them when they happened at the same instant", () => {
    const first = event(
      "b",
      "register-2",
      1,
      "2026-10-07T10:00:00.000Z",
      "2026-10-07T10:00:05.000Z",
    );
    const second = event(
      "a",
      "register-1",
      1,
      "2026-10-07T10:00:00.000Z",
      "2026-10-07T10:00:06.000Z",
    );

    expect(ids(inCreationOrder([second, first]))).toEqual(["b", "a"]);
  });

  it("follows the installation id when they happened and were received at the same instants", () => {
    const first = event("b", "register-1", 1, "2026-10-07T10:00:00.000Z");
    const second = event("a", "register-2", 1, "2026-10-07T10:00:00.000Z");

    expect(ids(inCreationOrder([second, first]))).toEqual(["b", "a"]);
  });

  it("keeps the sequence of an installation whose clock was set back, placing its later events by the latest instant it reported before them", () => {
    const first = event("a", "register-1", 1, "2026-10-07T10:00:00.000Z");
    const afterClockChange = event("b", "register-1", 2, "2026-10-07T09:00:00.000Z");
    const other = event("c", "register-2", 1, "2026-10-07T09:30:00.000Z");

    expect(ids(inCreationOrder([afterClockChange, other, first]))).toEqual(["c", "a", "b"]);
  });

  it("follows the sequence of the installation for events it reported at the same instants", () => {
    const events = [3, 2, 1].map((deviceSeq) =>
      event(`event-`, "register-1", deviceSeq, "2026-10-07T10:00:00.000Z"),
    );

    expect(ids(inCreationOrder(events))).toEqual(["event-1", "event-2", "event-3"]);
  });

  it("does not change the list it was given", () => {
    const events = [
      event("b", "register-1", 2, "2026-10-07T10:00:00.000Z"),
      event("a", "register-1", 1, "2026-10-07T10:00:00.000Z"),
    ];
    inCreationOrder(events);

    expect(ids(events)).toEqual(["b", "a"]);
  });

  it("orders any events the same whichever order they arrive in, each installation by its sequence", () => {
    const stamp = fc.date({ min: new Date("2026-10-01"), max: new Date("2026-10-02") });
    const eventsArbitrary = fc
      .uniqueArray(
        fc.record({
          deviceId: fc.constantFrom("register-1", "register-2", "register-3"),
          deviceSeq: fc.integer({ min: 1, max: 4 }),
          occurredAt: stamp,
          receivedAt: stamp,
        }),
        { selector: (e) => `${e.deviceId}/${e.deviceSeq}`, minLength: 1, maxLength: 12 },
      )
      .map((list) => list.map((fields, index) => ({ ...fields, eventId: `event-${index}` })));
    fc.assert(
      fc.property(eventsArbitrary, (events) => {
        const ordered = inCreationOrder(events);

        expect(ids(inCreationOrder([...events].reverse()))).toEqual(ids(ordered));
        for (const deviceId of ["register-1", "register-2", "register-3"]) {
          const seqs = ordered.filter((e) => e.deviceId === deviceId).map((e) => e.deviceSeq);
          expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
        }
      }),
    );
  });
});
