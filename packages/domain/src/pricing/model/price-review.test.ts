import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { priceReviewAt } from "./price-review.js";

const NOW = new Date("2026-01-05T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function reviewedOnly(lastReviewedAt: Date | null) {
  return { lastReviewedAt, reviewPostponed: false };
}

function reviewedAgo(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe("priceReviewAt", () => {
  const windowDays = 30;

  it("is not pending when the last review is exactly the window old", () => {
    expect(
      priceReviewAt(reviewedOnly(reviewedAgo(windowDays * DAY_MS)), NOW, windowDays).pending,
    ).toBe(false);
  });

  it("is pending once the last review is 1 ms older than the window", () => {
    expect(
      priceReviewAt(reviewedOnly(reviewedAgo(windowDays * DAY_MS + 1)), NOW, windowDays).pending,
    ).toBe(true);
  });

  it("is pending when the product was never reviewed, with no age", () => {
    expect(priceReviewAt(reviewedOnly(null), NOW, windowDays)).toEqual({
      pending: true,
      secondsSinceReview: null,
    });
  });

  it("with a zero-day window, is not pending only for a review at this very moment", () => {
    expect(priceReviewAt(reviewedOnly(NOW), NOW, 0).pending).toBe(false);
    expect(priceReviewAt(reviewedOnly(reviewedAgo(1)), NOW, 0).pending).toBe(true);
  });

  it.each([
    ["at this very moment", 0, 0],
    ["999 ms ago", 999, 0],
    ["1 second ago", 1000, 1],
    ["1999 ms ago", 1999, 1],
    ["5 minutes ago", 5 * 60_000, 300],
    ["24 hours ago", 24 * HOUR_MS, 86_400],
  ])("counts whole seconds: reviewed %s is %i seconds old", (_label, ago, seconds) => {
    expect(priceReviewAt(reviewedOnly(reviewedAgo(ago)), NOW, windowDays).secondsSinceReview).toBe(
      seconds,
    );
  });

  it("reads a review a few milliseconds in the future as zero seconds and not pending", () => {
    expect(priceReviewAt(reviewedOnly(new Date(NOW.getTime() + 5)), NOW, windowDays)).toEqual({
      pending: false,
      secondsSinceReview: 0,
    });
  });

  it("is pending exactly when more than the window has passed, whatever the review's age", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 }),
        fc.integer({ min: -DAY_MS, max: 400 * DAY_MS }),
        (window, ago) => {
          expect(priceReviewAt(reviewedOnly(reviewedAgo(ago)), NOW, window).pending).toBe(
            ago > window * DAY_MS,
          );
        },
      ),
    );
  });

  it("never reports a negative age and counts whole seconds for any review", () => {
    fc.assert(
      fc.property(fc.integer({ min: -DAY_MS, max: 400 * DAY_MS }), (ago) => {
        expect(
          priceReviewAt(reviewedOnly(reviewedAgo(ago)), NOW, windowDays).secondsSinceReview,
        ).toBe(Math.max(0, Math.floor(ago / 1000)));
      }),
    );
  });

  describe("with a postponed review", () => {
    it("is pending however recent the last review is", () => {
      expect(
        priceReviewAt(
          { lastReviewedAt: reviewedAgo(DAY_MS), reviewPostponed: true },
          NOW,
          windowDays,
        ),
      ).toEqual({ pending: true, secondsSinceReview: 86_400 });
    });

    it("is pending for a product never reviewed, with no age", () => {
      expect(
        priceReviewAt({ lastReviewedAt: null, reviewPostponed: true }, NOW, windowDays),
      ).toEqual({ pending: true, secondsSinceReview: null });
    });

    it("is pending for any review age and window", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 365 }),
          fc.integer({ min: -DAY_MS, max: 400 * DAY_MS }),
          (window, ago) => {
            expect(
              priceReviewAt(
                { lastReviewedAt: reviewedAgo(ago), reviewPostponed: true },
                NOW,
                window,
              ).pending,
            ).toBe(true);
          },
        ),
      );
    });
  });
});
