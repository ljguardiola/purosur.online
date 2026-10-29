import { argentinaCalendarDay, type ZoneRules } from "../../shared/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PriceReviewPendingReason = "overdue" | "postponed" | "never_reviewed";

export interface PriceReviewDeadlineHistory {
  lastReviewedAt: Date | null;
  earliestPostponedAt: Date | null;
}

export interface PriceReviewDeadline {
  reason: PriceReviewPendingReason;
  pastDeadlineOn: string | null;
}

export function priceReviewDeadlineOf(
  { lastReviewedAt, earliestPostponedAt }: PriceReviewDeadlineHistory,
  reviewWindowDays: number,
  rules: ZoneRules,
): PriceReviewDeadline {
  if (!lastReviewedAt) {
    return { reason: "never_reviewed", pastDeadlineOn: null };
  }
  const overdueOn = argentinaCalendarDay(
    new Date(lastReviewedAt.getTime() + reviewWindowDays * DAY_MS),
    rules,
  );
  if (!earliestPostponedAt) {
    return { reason: "overdue", pastDeadlineOn: overdueOn };
  }
  const postponedOn = argentinaCalendarDay(earliestPostponedAt, rules);
  return postponedOn <= overdueOn
    ? { reason: "postponed", pastDeadlineOn: postponedOn }
    : { reason: "overdue", pastDeadlineOn: overdueOn };
}
