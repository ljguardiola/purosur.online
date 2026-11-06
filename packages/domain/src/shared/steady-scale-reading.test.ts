import { describe, expect, it } from "vitest";
import type { ScaleReading } from "./scale.js";
import { steadyScaleReading } from "./steady-scale-reading.js";

const STABLE_AT = new Date("2026-11-06T15:00:00.000Z");

function after(ms: number): Date {
  return new Date(STABLE_AT.getTime() + ms);
}

const lastStable = { weightThousandths: 1250, at: STABLE_AT };

describe("steadyScaleReading", () => {
  it("passes a stable reading on, remembering its weight and when it came", () => {
    expect(
      steadyScaleReading({ kind: "stable", weightThousandths: 1250 }, undefined, STABLE_AT),
    ).toEqual({
      reading: { kind: "stable", weightThousandths: 1250 },
      lastStable: { weightThousandths: 1250, at: STABLE_AT },
    });
  });

  it("remembers a new stable reading in place of the previous one", () => {
    expect(
      steadyScaleReading({ kind: "stable", weightThousandths: 2500 }, lastStable, after(100)),
    ).toEqual({
      reading: { kind: "stable", weightThousandths: 2500 },
      lastStable: { weightThousandths: 2500, at: after(100) },
    });
  });

  it.each<ScaleReading>([
    { kind: "unstable", weightThousandths: 1250 },
    { kind: "not_stable" },
  ])("holds the stable weight through a brief %o at that weight", (reading) => {
    expect(steadyScaleReading(reading, lastStable, after(40))).toEqual({
      reading: { kind: "held_stable", weightThousandths: 1250 },
      lastStable,
    });
  });

  it.each<ScaleReading>([
    { kind: "unstable", weightThousandths: 1250 },
    { kind: "not_stable" },
  ])("still holds a %o three hundred milliseconds after the stable reading", (reading) => {
    expect(steadyScaleReading(reading, lastStable, after(300))).toEqual({
      reading: { kind: "held_stable", weightThousandths: 1250 },
      lastStable,
    });
  });

  it.each<ScaleReading>([
    { kind: "unstable", weightThousandths: 1250 },
    { kind: "not_stable" },
  ])("leaves stable for a %o more than three hundred milliseconds after the stable reading", (reading) => {
    expect(steadyScaleReading(reading, lastStable, after(301))).toEqual({
      reading,
      lastStable: undefined,
    });
  });

  it.each([1249, 1251, 0])(
    "leaves stable at once for an unstable reading at another weight, %s thousandths",
    (weightThousandths) => {
      expect(
        steadyScaleReading({ kind: "unstable", weightThousandths }, lastStable, after(40)),
      ).toEqual({ reading: { kind: "unstable", weightThousandths }, lastStable: undefined });
    },
  );

  it("leaves stable at once when the scale becomes unavailable", () => {
    expect(steadyScaleReading({ kind: "unavailable" }, lastStable, after(40))).toEqual({
      reading: { kind: "unavailable" },
      lastStable: undefined,
    });
  });

  it.each<ScaleReading>([
    { kind: "unstable", weightThousandths: 1250 },
    { kind: "not_stable" },
    { kind: "unavailable" },
  ])("holds nothing for a %o when no stable reading came before", (reading) => {
    expect(steadyScaleReading(reading, undefined, STABLE_AT)).toEqual({
      reading,
      lastStable: undefined,
    });
  });

  it("measures the hold window from the last stable reading, not from the held ones", () => {
    const held = steadyScaleReading({ kind: "not_stable" }, lastStable, after(200));
    expect(
      steadyScaleReading({ kind: "not_stable" }, held.lastStable, after(301)),
    ).toEqual({ reading: { kind: "not_stable" }, lastStable: undefined });
  });
});
