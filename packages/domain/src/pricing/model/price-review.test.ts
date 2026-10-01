import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { priceReviewAt } from "./price-review.js";

const NOW = new Date("2026-01-05T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function reviewedAgo(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe("priceReviewAt", () => {
  const windowDays = 30;

  it("is not pending when the last review is exactly the window old", () => {
    expect(priceReviewAt(reviewedAgo(windowDays * DAY_MS), NOW, windowDays).pending).toBe(false);
  });

  it("is pending once the last review is 1 ms older than the window", () => {
    expect(priceReviewAt(reviewedAgo(windowDays * DAY_MS + 1), NOW, windowDays).pending).toBe(true);
  });

  it("is pending when the product was never reviewed, with no age", () => {
    expect(priceReviewAt(null, NOW, windowDays)).toEqual({
      pending: true,
      daysSinceReview: null,
    });
  });

  it("with a zero-day window, is not pending only for a review at this very moment", () => {
    expect(priceReviewAt(NOW, NOW, 0).pending).toBe(false);
    expect(priceReviewAt(reviewedAgo(1), NOW, 0).pending).toBe(true);
  });

  it.each([
    ["at this very moment", 0, 0],
    ["23 hours 59 minutes ago", 24 * HOUR_MS - 60_000, 0],
    ["24 hours ago", 24 * HOUR_MS, 1],
    ["47 hours ago", 47 * HOUR_MS, 1],
    ["48 hours ago", 48 * HOUR_MS, 2],
  ])("counts whole 24-hour periods: reviewed %s is %i days old", (_label, ago, days) => {
    expect(priceReviewAt(reviewedAgo(ago), NOW, windowDays).daysSinceReview).toBe(days);
  });

  it("reads a review a few milliseconds in the future as today and not pending", () => {
    expect(priceReviewAt(new Date(NOW.getTime() + 5), NOW, windowDays)).toEqual({
      pending: false,
      daysSinceReview: 0,
    });
  });

  it("is pending exactly when more than the window has passed, whatever the review's age", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 }),
        fc.integer({ min: -DAY_MS, max: 400 * DAY_MS }),
        (window, ago) => {
          expect(priceReviewAt(reviewedAgo(ago), NOW, window).pending).toBe(ago > window * DAY_MS);
        },
      ),
    );
  });

  it("never reports a negative age and counts whole periods for any review", () => {
    fc.assert(
      fc.property(fc.integer({ min: -DAY_MS, max: 400 * DAY_MS }), (ago) => {
        expect(priceReviewAt(reviewedAgo(ago), NOW, windowDays).daysSinceReview).toBe(
          Math.max(0, Math.floor(ago / DAY_MS)),
        );
      }),
    );
  });
});
