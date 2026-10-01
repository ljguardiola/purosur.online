const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;

export interface PriceReview {
  pending: boolean;
  secondsSinceReview: number | null;
}

export function priceReviewAt(
  lastReviewedAt: Date | null,
  now: Date,
  reviewWindowDays: number,
): PriceReview {
  if (!lastReviewedAt) {
    return { pending: true, secondsSinceReview: null };
  }
  const elapsedMs = now.getTime() - lastReviewedAt.getTime();
  return {
    pending: elapsedMs > reviewWindowDays * DAY_MS,
    secondsSinceReview: Math.max(0, Math.floor(elapsedMs / SECOND_MS)),
  };
}
