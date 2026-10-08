import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_CALL_MARGIN_MS,
  authorizationCallDeadline,
  mayStartAuthorizationCall,
  medianRoundTripMs,
  REAL_TIME_AUTHORIZATION_TIMEOUT_MS,
  ROUND_TRIP_SAMPLE_SIZE,
} from "./real-time-authorization.js";

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

const RECEIVED_AT = new Date("2026-10-01T12:00:00.000Z");

describe("REAL_TIME_AUTHORIZATION_TIMEOUT_MS", () => {
  it("makes the register wait 5 seconds at most", () => {
    expect(REAL_TIME_AUTHORIZATION_TIMEOUT_MS).toBe(5_000);
  });
});

describe("AUTHORIZATION_CALL_MARGIN_MS", () => {
  it("keeps a margin of 500 milliseconds", () => {
    expect(AUTHORIZATION_CALL_MARGIN_MS).toBe(500);
  });
});

describe("authorizationCallDeadline", () => {
  it("is the moment of the request plus the budget, minus the margin, minus half the round trip", () => {
    const deadline = authorizationCallDeadline({
      receivedAt: RECEIVED_AT,
      timeoutMs: 5_000,
      roundTripMedianMs: 200,
    });

    expect(deadline).toEqual(new Date("2026-10-01T12:00:04.400Z"));
  });

  it("falls on the earlier whole millisecond when half the round trip is fractional", () => {
    const deadline = authorizationCallDeadline({
      receivedAt: RECEIVED_AT,
      timeoutMs: 5_000,
      roundTripMedianMs: 101,
    });

    expect(deadline).toEqual(new Date("2026-10-01T12:00:04.449Z"));
  });

  it("moves back by half of each extra millisecond of the round trip and by each one of the margin", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 10_000 }),
        fc.integer({ min: 0, max: 4_000 }),
        (timeoutMs, roundTripMedianMs) => {
          const deadline = authorizationCallDeadline({
            receivedAt: RECEIVED_AT,
            timeoutMs,
            roundTripMedianMs,
          });

          expect(deadline.getTime()).toBe(
            Math.floor(
              RECEIVED_AT.getTime() +
                timeoutMs -
                AUTHORIZATION_CALL_MARGIN_MS -
                roundTripMedianMs / 2,
            ),
          );
        },
      ),
    );
  });
});

describe("mayStartAuthorizationCall", () => {
  const deadline = new Date("2026-10-01T12:00:04.400Z");

  it("allows the call before the deadline", () => {
    expect(mayStartAuthorizationCall(deadline, new Date(deadline.getTime() - 1))).toBe(true);
  });

  it("allows the call at the deadline itself", () => {
    expect(mayStartAuthorizationCall(deadline, deadline)).toBe(true);
  });

  it("refuses the call once the deadline has passed", () => {
    expect(mayStartAuthorizationCall(deadline, new Date(deadline.getTime() + 1))).toBe(false);
  });
});
