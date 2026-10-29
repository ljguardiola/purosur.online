import { describe, expect, it } from "vitest";
import { FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import { fixedOffsetZoneRules } from "../../shared/test-support/fake-zone-rules-source.js";
import { priceReviewDeadlineOf } from "./price-review-deadline.js";

const WINDOW_DAYS = 30;
const RULES = FIXED_ARGENTINA_ZONE_RULES;

describe("priceReviewDeadlineOf", () => {
  it("has no day for a price never reviewed", () => {
    expect(
      priceReviewDeadlineOf(
        { lastReviewedAt: null, earliestPostponedAt: null },
        WINDOW_DAYS,
        RULES,
      ),
    ).toEqual({ reason: "never_reviewed", pastDeadlineOn: null });
  });

  it("has no day for a price never reviewed even when its review was postponed", () => {
    expect(
      priceReviewDeadlineOf(
        { lastReviewedAt: null, earliestPostponedAt: new Date("2026-02-01T12:00:00.000Z") },
        WINDOW_DAYS,
        RULES,
      ),
    ).toEqual({ reason: "never_reviewed", pastDeadlineOn: null });
  });

  it("names the day the window ends after the last review for an overdue price", () => {
    expect(
      priceReviewDeadlineOf(
        { lastReviewedAt: new Date("2026-01-05T15:00:00.000Z"), earliestPostponedAt: null },
        WINDOW_DAYS,
        RULES,
      ),
    ).toEqual({ reason: "overdue", pastDeadlineOn: "2026-02-04" });
  });

  it("reads the day in Argentina, where the late evening is still the same calendar day", () => {
    expect(
      priceReviewDeadlineOf(
        { lastReviewedAt: new Date("2026-01-06T01:00:00.000Z"), earliestPostponedAt: null },
        10,
        RULES,
      ),
    ).toEqual({ reason: "overdue", pastDeadlineOn: "2026-01-15" });
  });

  it("reads the day with the zone rules it is given", () => {
    expect(
      priceReviewDeadlineOf(
        { lastReviewedAt: new Date("2026-01-06T01:00:00.000Z"), earliestPostponedAt: null },
        10,
        fixedOffsetZoneRules(0),
      ),
    ).toEqual({ reason: "overdue", pastDeadlineOn: "2026-01-16" });
  });

  it("names the day of the postponement for a postponed price", () => {
    expect(
      priceReviewDeadlineOf(
        {
          lastReviewedAt: new Date("2026-01-20T12:00:00.000Z"),
          earliestPostponedAt: new Date("2026-01-25T03:00:00.000Z"),
        },
        WINDOW_DAYS,
        RULES,
      ),
    ).toEqual({ reason: "postponed", pastDeadlineOn: "2026-01-25" });
  });

  it("names the postponement when it came before the window ended", () => {
    expect(
      priceReviewDeadlineOf(
        {
          lastReviewedAt: new Date("2026-01-01T12:00:00.000Z"),
          earliestPostponedAt: new Date("2026-01-10T12:00:00.000Z"),
        },
        WINDOW_DAYS,
        RULES,
      ),
    ).toEqual({ reason: "postponed", pastDeadlineOn: "2026-01-10" });
  });

  it("names the window's end when it came before the postponement", () => {
    expect(
      priceReviewDeadlineOf(
        {
          lastReviewedAt: new Date("2026-01-01T12:00:00.000Z"),
          earliestPostponedAt: new Date("2026-03-10T12:00:00.000Z"),
        },
        WINDOW_DAYS,
        RULES,
      ),
    ).toEqual({ reason: "overdue", pastDeadlineOn: "2026-01-31" });
  });

  it("names the postponement when it falls on the very day the window ends", () => {
    expect(
      priceReviewDeadlineOf(
        {
          lastReviewedAt: new Date("2026-01-01T12:00:00.000Z"),
          earliestPostponedAt: new Date("2026-01-31T20:00:00.000Z"),
        },
        WINDOW_DAYS,
        RULES,
      ),
    ).toEqual({ reason: "postponed", pastDeadlineOn: "2026-01-31" });
  });
});
