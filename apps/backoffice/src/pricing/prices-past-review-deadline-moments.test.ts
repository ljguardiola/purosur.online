import { expect, test } from "vitest";
import { lastReviewedText } from "./prices-past-review-deadline-moments";

test("writes the last review in Argentina's time, whatever offset the instant is written in", () => {
  expect(lastReviewedText("2026-08-01T01:00:00.000Z")).toBe("31/07/2026 · 22:00");
});

test("says a price never reviewed was never reviewed", () => {
  expect(lastReviewedText(null)).toBe("Nunca");
});
