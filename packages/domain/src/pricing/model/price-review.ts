const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;

export interface PriceReview {
  pending: boolean;
  secondsSinceReview: number | null;
}

export interface PriceReviewHistory {
  lastReviewedAt: Date | null;
  reviewPostponed: boolean;
}

export interface PriceReviewPostponement {
  locationId: string;
  purchaseId: string;
  actorId: string;
  postponedAt: Date;
  productIds: string[];
}

export function priceReviewAt(
  { lastReviewedAt, reviewPostponed }: PriceReviewHistory,
  now: Date,
  reviewWindowDays: number,
): PriceReview {
  if (!lastReviewedAt) {
    return { pending: true, secondsSinceReview: null };
  }
  const elapsedMs = now.getTime() - lastReviewedAt.getTime();
  return {
    pending: reviewPostponed || elapsedMs > reviewWindowDays * DAY_MS,
    secondsSinceReview: Math.max(0, Math.floor(elapsedMs / SECOND_MS)),
  };
}
