import { describe, expect, it } from "vitest";
import { type HeldEventState, nextEventToApply } from "./next-event-to-apply.js";

const NOW = new Date("2026-10-07T12:00:00.000Z");

function held(overrides: Partial<HeldEventState> & { eventId: string }): HeldEventState {
  return {
    deviceId: "register-1",
    deviceSeq: 1,
    occurredAt: new Date("2026-10-07T10:00:00.000Z"),
    receivedAt: new Date("2026-10-07T10:00:00.000Z"),
    quarantinedAt: null,
    nextAttemptAt: null,
    ...overrides,
  };
}

describe("which event of an aggregate is applied next", () => {
  it("is none when nothing is waiting", () => {
    expect(nextEventToApply([], NOW)).toEqual({ kind: "none" });
  });

  it("is the earliest created event when it can be applied", () => {
    const earliest = held({ eventId: "a", deviceSeq: 1 });
    const later = held({ eventId: "b", deviceSeq: 2 });

    expect(nextEventToApply([later, earliest], NOW)).toEqual({ kind: "due", event: earliest });
  });

  it("is due when its next attempt is exactly now", () => {
    const retrying = held({ eventId: "a", nextAttemptAt: NOW });

    expect(nextEventToApply([retrying], NOW)).toEqual({ kind: "due", event: retrying });
  });

  it("waits for the next attempt of the earliest event, applying no later one meanwhile", () => {
    const until = new Date("2026-10-07T12:00:01.000Z");
    const earliest = held({ eventId: "a", deviceSeq: 1, nextAttemptAt: until });
    const later = held({ eventId: "b", deviceSeq: 2 });

    expect(nextEventToApply([later, earliest], NOW)).toEqual({ kind: "waiting", until });
  });

  it("is blocked by the earliest event when it is quarantined, applying no later one", () => {
    const quarantined = held({ eventId: "a", deviceSeq: 1, quarantinedAt: NOW });
    const later = held({ eventId: "b", deviceSeq: 2 });

    expect(nextEventToApply([later, quarantined], NOW)).toEqual({
      kind: "blocked_by_quarantine",
      eventId: "a",
    });
  });

  it("is blocked by a quarantined event even when its next attempt had passed", () => {
    const quarantined = held({
      eventId: "a",
      quarantinedAt: NOW,
      nextAttemptAt: new Date("2026-10-07T11:00:00.000Z"),
    });

    expect(nextEventToApply([quarantined], NOW)).toEqual({
      kind: "blocked_by_quarantine",
      eventId: "a",
    });
  });

  it("ignores a quarantined event that is not the earliest", () => {
    const earliest = held({ eventId: "a", deviceSeq: 1 });
    const later = held({ eventId: "b", deviceSeq: 2, quarantinedAt: NOW });

    expect(nextEventToApply([later, earliest], NOW)).toEqual({ kind: "due", event: earliest });
  });
});
