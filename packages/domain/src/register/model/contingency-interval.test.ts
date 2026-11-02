import { describe, expect, it } from "vitest";
import { contingencyIntervalEnd } from "./contingency-interval.js";

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
