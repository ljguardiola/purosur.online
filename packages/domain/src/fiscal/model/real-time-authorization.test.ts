import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { medianRoundTripMs, ROUND_TRIP_SAMPLE_SIZE } from "./real-time-authorization.js";

describe("ROUND_TRIP_SAMPLE_SIZE", () => {
  it("looks at the last 12 health checks", () => {
    expect(ROUND_TRIP_SAMPLE_SIZE).toBe(12);
  });
});

describe("medianRoundTripMs", () => {
  it("is null without samples", () => {
    expect(medianRoundTripMs([])).toBeNull();
  });

  it("is the only sample when there is one", () => {
    expect(medianRoundTripMs([180])).toBe(180);
  });

  it("is the middle sample when the count is odd", () => {
    expect(medianRoundTripMs([300, 100, 200])).toBe(200);
  });

  it("is the mean of the two middle samples when the count is even", () => {
    expect(medianRoundTripMs([100, 400, 200, 300])).toBe(250);
  });

  it("rounds a mean ending in half a millisecond up", () => {
    expect(medianRoundTripMs([100, 101])).toBe(101);
  });

  it("considers only the last 12 samples, the newest last", () => {
    const older = [9_000, 9_000, 9_000];
    const lastTwelve = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

    expect(medianRoundTripMs([...older, ...lastTwelve])).toBe(65);
  });

  it("keeps all samples when there are exactly 12", () => {
    expect(medianRoundTripMs([1, 1, 1, 1, 1, 1, 9, 9, 9, 9, 9, 9])).toBe(5);
  });

  it("lies between the smallest and the largest of the last samples", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 60_000 }), { minLength: 1 }), (samples) => {
        const lastSamples = samples.slice(-ROUND_TRIP_SAMPLE_SIZE);
        const median = medianRoundTripMs(samples);

        expect(median).toBeGreaterThanOrEqual(Math.min(...lastSamples));
        expect(median).toBeLessThanOrEqual(Math.max(...lastSamples));
      }),
    );
  });

  it("does not depend on the order of the last samples", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 60_000 }), { minLength: 1, maxLength: 12 }),
        (samples) => {
          expect(medianRoundTripMs([...samples].reverse())).toBe(medianRoundTripMs(samples));
        },
      ),
    );
  });
});
