import { describe, expect, it } from "vitest";
import { liveScaleReading } from "./live-scale-reading.js";

describe("liveScaleReading", () => {
  it.each([
    ["stable", { kind: "stable", weightThousandths: 410 }],
    ["held_stable", { kind: "held_stable", weightThousandths: 410 }],
  ] as const)("shows a %s weight as settled", (_name, reading) => {
    expect(liveScaleReading(reading)).toEqual({
      kind: "reading",
      weightThousandths: 410,
      settled: true,
    });
  });

  it("shows an unstable weight as not settled", () => {
    expect(liveScaleReading({ kind: "unstable", weightThousandths: 395 })).toEqual({
      kind: "reading",
      weightThousandths: 395,
      settled: false,
    });
  });

  it("shows no value while the scale has not settled", () => {
    expect(liveScaleReading({ kind: "not_stable" })).toEqual({ kind: "settling" });
  });

  it("shows no reading when the scale does not answer", () => {
    expect(liveScaleReading({ kind: "unavailable" })).toEqual({ kind: "no_reading" });
  });
});
