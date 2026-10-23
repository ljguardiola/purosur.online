import { describe, expect, it } from "vitest";
import { canonicalOutboxEvent, type OutboxEvent } from "../../shared/index.js";
import {
  chainedEventsHold,
  eventLinkHolds,
  placementOfEvent,
  seqsJoinedBy,
} from "./event-placement.js";
import type { PushedEvent } from "./push-batch.js";

const DEVICE = "device-1";
const CHAIN_KEY = "chain-key-1";

const readableChain = {
  link: (chainKey: string, previousLink: string | null, canonicalEvent: string) =>
    `${chainKey}|${previousLink ?? "origin"}|${canonicalEvent}`,
};

function unchained(deviceSeq: number, eventId = `event-${deviceSeq}`): OutboxEvent {
  return {
    event_id: eventId,
    device_seq: deviceSeq,
    aggregate_type: "Sale",
    aggregate_id: `sale-${deviceSeq}`,
    event_type: "sale_opened",
    schema_version: 1,
    payload: { seq: deviceSeq },
    occurred_at: "2026-09-30T12:00:00.000Z",
    actor_id: "user-1",
  };
}

function chainedFrom(previousLink: string | null, event: OutboxEvent): PushedEvent {
  return {
    ...event,
    chain_hmac: readableChain.link(CHAIN_KEY, previousLink, canonicalOutboxEvent(event)),
  };
}

function chainOf(...deviceSeqs: number[]): PushedEvent[] {
  let previousLink: string | null = null;
  return deviceSeqs.map((deviceSeq) => {
    const event = chainedFrom(previousLink, unchained(deviceSeq));
    previousLink = event.chain_hmac;
    return event;
  });
}

const [FIRST, SECOND] = chainOf(1, 2) as [PushedEvent, PushedEvent];

describe("placementOfEvent", () => {
  it("places an event the inbox does not hold anywhere as new", () => {
    expect(placementOfEvent(DEVICE, SECOND, undefined, undefined)).toEqual({
      held: false,
      stale: false,
      misplaced: false,
    });
  });

  it("places an event held at its own seq of its own installation as held", () => {
    expect(
      placementOfEvent(DEVICE, SECOND, SECOND.event_id, { deviceId: DEVICE, deviceSeq: 2 }),
    ).toEqual({ held: true, stale: false, misplaced: false });
  });

  it("places an event whose seq holds another event as stale", () => {
    expect(placementOfEvent(DEVICE, SECOND, "another-event", undefined)).toEqual({
      held: true,
      stale: true,
      misplaced: false,
    });
  });

  it("places an event whose id another installation holds as misplaced", () => {
    expect(
      placementOfEvent(DEVICE, SECOND, undefined, { deviceId: "device-2", deviceSeq: 2 }),
    ).toEqual({ held: false, stale: false, misplaced: true });
  });

  it("places an event whose id its installation holds at another seq as misplaced", () => {
    expect(placementOfEvent(DEVICE, SECOND, undefined, { deviceId: DEVICE, deviceSeq: 3 })).toEqual(
      { held: false, stale: false, misplaced: true },
    );
  });
});

describe("eventLinkHolds", () => {
  it("holds for an event chained from the link before it with the installation's key", () => {
    expect(eventLinkHolds(readableChain, CHAIN_KEY, FIRST.chain_hmac, SECOND)).toBe(true);
  });

  it("holds for the first event chained from the origin", () => {
    expect(eventLinkHolds(readableChain, CHAIN_KEY, null, FIRST)).toBe(true);
  });

  it("does not hold for an event carrying another link", () => {
    expect(
      eventLinkHolds(readableChain, CHAIN_KEY, FIRST.chain_hmac, {
        ...SECOND,
        chain_hmac: "forged-link",
      }),
    ).toBe(false);
  });

  it("does not hold after another link before it", () => {
    expect(eventLinkHolds(readableChain, CHAIN_KEY, "another-link", SECOND)).toBe(false);
  });

  it("does not hold with another key", () => {
    expect(eventLinkHolds(readableChain, "chain-key-2", FIRST.chain_hmac, SECOND)).toBe(false);
  });

  it("does not hold for an event altered after it was chained", () => {
    expect(
      eventLinkHolds(readableChain, CHAIN_KEY, FIRST.chain_hmac, {
        ...SECOND,
        payload: { seq: 99 },
      }),
    ).toBe(false);
  });
});

describe("chainedEventsHold", () => {
  it("holds for no event", () => {
    expect(chainedEventsHold(readableChain, CHAIN_KEY, "any-link", [])).toBe(true);
  });

  it("holds for events that each chain from the one before, the first from the link given", () => {
    expect(chainedEventsHold(readableChain, CHAIN_KEY, null, chainOf(1, 2, 3))).toBe(true);
  });

  it("does not hold when the first event does not chain from the link given", () => {
    const [, second, third] = chainOf(1, 2, 3) as [PushedEvent, PushedEvent, PushedEvent];

    expect(chainedEventsHold(readableChain, CHAIN_KEY, "another-link", [second, third])).toBe(
      false,
    );
  });

  it("does not hold when a later event was altered after it was chained", () => {
    const [first, second, third] = chainOf(1, 2, 3) as [PushedEvent, PushedEvent, PushedEvent];

    expect(
      chainedEventsHold(readableChain, CHAIN_KEY, null, [
        first,
        { ...second, payload: { seq: 99 } },
        third,
      ]),
    ).toBe(false);
  });

  it("chains each event from the link the one before it carries", () => {
    const [first, , third] = chainOf(1, 2, 3) as [PushedEvent, PushedEvent, PushedEvent];

    expect(chainedEventsHold(readableChain, CHAIN_KEY, null, [first, third])).toBe(false);
  });
});

describe("seqsJoinedBy", () => {
  it("joins nothing when nothing arrives", () => {
    expect(seqsJoinedBy([1, 2, 4], [])).toEqual({ above: 2, upTo: 2 });
  });

  it("joins up to the arriving seqs that follow the held ones without a hole", () => {
    expect(seqsJoinedBy([1, 2], [3, 4])).toEqual({ above: 2, upTo: 4 });
  });

  it("joins the held seqs above a hole the arriving ones fill, up to the next hole", () => {
    expect(seqsJoinedBy([1, 4, 5, 7], [2, 3])).toEqual({ above: 1, upTo: 5 });
  });

  it("joins nothing when the arriving seqs leave a hole below them", () => {
    expect(seqsJoinedBy([1, 4], [3])).toEqual({ above: 1, upTo: 1 });
  });

  it("joins from the origin when nothing is held", () => {
    expect(seqsJoinedBy([3], [1, 2])).toEqual({ above: 0, upTo: 3 });
  });
});
