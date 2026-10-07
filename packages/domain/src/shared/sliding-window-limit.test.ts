import { describe, expect, it } from "vitest";
import { slidingWindowRetryAfterSeconds, slidingWindowStart } from "./sliding-window-limit.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const POLICY = { limit: 3, windowMs: 10 * 60 * 1000 };

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

describe("slidingWindowStart", () => {
  it("starts one window before now", () => {
    expect(slidingWindowStart(NOW, POLICY)).toEqual(minutesAgo(10));
  });
});

describe("slidingWindowRetryAfterSeconds", () => {
  it("accepts an attempt while fewer than the limit were accepted in the window", () => {
    expect(slidingWindowRetryAfterSeconds([minutesAgo(1), minutesAgo(2)], NOW, POLICY)).toBe(
      undefined,
    );
  });

  it("refuses at the limit until the oldest counted attempt leaves the window", () => {
    expect(
      slidingWindowRetryAfterSeconds([minutesAgo(1), minutesAgo(2), minutesAgo(7)], NOW, POLICY),
    ).toBe(3 * 60);
  });

  it("waits for the newest attempts that fill the limit, in any order", () => {
    expect(
      slidingWindowRetryAfterSeconds(
        [minutesAgo(9), minutesAgo(1), minutesAgo(2), minutesAgo(5)],
        NOW,
        POLICY,
      ),
    ).toBe(5 * 60);
  });

  it("rounds a partial second of waiting up to a whole second", () => {
    const oldest = new Date(minutesAgo(10).getTime() + 1);

    expect(
      slidingWindowRetryAfterSeconds([minutesAgo(1), minutesAgo(2), oldest], NOW, POLICY),
    ).toBe(1);
  });

  it("ignores attempts from before the window", () => {
    expect(
      slidingWindowRetryAfterSeconds([minutesAgo(1), minutesAgo(2), minutesAgo(10)], NOW, POLICY),
    ).toBe(undefined);
  });
});
