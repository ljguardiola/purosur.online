const DAY_MS = 24 * 60 * 60 * 1000;

export interface PriceReview {
  pending: boolean;
  daysSinceReview: number | null;
}

function daysElapsedSince(moment: Date, now: Date): number {
  return (now.getTime() - moment.getTime()) / DAY_MS;
}

export function priceReviewAt(
  lastReviewedAt: Date | null,
  now: Date,
  reviewWindowDays: number,
): PriceReview {
  if (!lastReviewedAt) {
    return { pending: true, daysSinceReview: null };
  }
  const elapsedDays = daysElapsedSince(lastReviewedAt, now);
  return {
    pending: elapsedDays > reviewWindowDays,
    daysSinceReview: Math.max(0, Math.floor(elapsedDays)),
  };
}
