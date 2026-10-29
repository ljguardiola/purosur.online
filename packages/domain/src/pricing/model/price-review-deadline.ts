import { argentinaCalendarDay, type ReportPeriod, type ZoneRules } from "../../shared/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const PRICE_REVIEW_PENDING_REASONS = ["overdue", "postponed", "never_reviewed"] as const;

export type PriceReviewPendingReason = (typeof PRICE_REVIEW_PENDING_REASONS)[number];

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

export function pricesPastDeadlinePeriodOf(
  { from, to }: { from?: string; to?: string },
  pastDeadlineDays: readonly (string | null)[],
  today: string,
): ReportPeriod {
  if (from !== undefined && to !== undefined) {
    return { from, to };
  }
  const [earliest = today] = [today, ...pastDeadlineDays.filter((day) => day !== null)].sort();
  return { from: earliest, to: today };
}
