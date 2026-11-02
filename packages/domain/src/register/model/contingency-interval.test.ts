import { describe, expect, it } from "vitest";
import { contingencyIntervalEnd, replacedRegisterContingencyEnd } from "./contingency-interval.js";

const STARTED = new Date("2026-10-02T12:00:00.000Z");

describe("contingencyIntervalEnd", () => {
  it("ends an interval at the moment it is closed", () => {
    const closedAt = new Date("2026-10-02T13:00:00.000Z");

    expect(contingencyIntervalEnd(STARTED, closedAt)).toEqual(closedAt);
  });

  it("ends an interval closed at a moment before it started at its start", () => {
    expect(contingencyIntervalEnd(STARTED, new Date("2026-10-02T11:00:00.000Z"))).toEqual(STARTED);
  });
});

describe("replacedRegisterContingencyEnd", () => {
  const LAST_SEEN = new Date("2026-10-02T14:00:00.000Z");

  it("ends an interval at the last moment the replaced register was known to be running", () => {
    expect(
      replacedRegisterContingencyEnd({
        startedAt: STARTED,
        lastSeenAt: LAST_SEEN,
        sessionClosedAt: null,
      }),
    ).toEqual(LAST_SEEN);
  });

  it("ends an interval when the replaced register closed its cash session, though it ran later", () => {
    const sessionClosedAt = new Date("2026-10-02T13:00:00.000Z");

    expect(
      replacedRegisterContingencyEnd({
        startedAt: STARTED,
        lastSeenAt: LAST_SEEN,
        sessionClosedAt,
      }),
    ).toEqual(sessionClosedAt);
  });

  it("ends an interval at the last moment seen when the session closed after it", () => {
    expect(
      replacedRegisterContingencyEnd({
        startedAt: STARTED,
        lastSeenAt: LAST_SEEN,
        sessionClosedAt: new Date("2026-10-02T15:00:00.000Z"),
      }),
    ).toEqual(LAST_SEEN);
  });

  it("ends an interval last seen before it started at its start", () => {
    expect(
      replacedRegisterContingencyEnd({
        startedAt: STARTED,
        lastSeenAt: new Date("2026-10-02T11:00:00.000Z"),
        sessionClosedAt: new Date("2026-10-02T10:00:00.000Z"),
      }),
    ).toEqual(STARTED);
  });
});
